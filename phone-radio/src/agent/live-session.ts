import WebSocket, { type ClientOptions, type RawData } from "ws";
import type { AgentVoiceSession } from "./bridge-manager.js";

export const LIVE_SESSION_TIMEOUT_MS = 15_000;
// Accommodates the bridge's bounded 15-second startup buffer after base64 encoding.
export const LIVE_MAX_BUFFERED_BYTES = 1024 * 1024;

type LiveSocket = Pick<
  WebSocket,
  "on" | "send" | "close" | "terminate" | "readyState" | "bufferedAmount"
>;

export type LiveSessionOptions = Readonly<{
  apiKey: string;
  onAudio: (audio: Buffer) => void;
  onFailure: (reason: string) => void;
  onUsage?: (seconds: number) => void;
  onFinalization?: (confirmed: boolean) => void;
  socketFactory?: (url: string, options: ClientOptions) => LiveSocket;
}>;

type SessionState = "idle" | "starting" | "running" | "closing" | "closed";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A private Live conversation without transcript or audio persistence. */
export class LiveSession implements AgentVoiceSession {
  private state: SessionState = "idle";
  private socket: LiveSocket | null = null;
  private pendingByte = Buffer.alloc(0);
  private startPromise: Promise<void> | null = null;
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((error: Error) => void) | null = null;
  private closePromise: Promise<void> | null = null;
  private resolveClose: (() => void) | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private failureReported = false;
  private finalizationConfirmed = false;
  private finalizationReported = false;

  constructor(private readonly options: LiveSessionOptions) {}

  start(): Promise<void> {
    if (this.state === "closed" || this.state === "closing") {
      return Promise.reject(new Error("Live session is closed."));
    }
    if (this.startPromise) return this.startPromise;

    this.state = "starting";
    this.startPromise = new Promise<void>((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    this.startTimer = setTimeout(
      () => this.fail("live-start-timeout"),
      LIVE_SESSION_TIMEOUT_MS,
    );
    this.startTimer.unref();

    try {
      const createSocket =
        this.options.socketFactory ??
        ((url: string, options: ClientOptions) => new WebSocket(url, options));
      this.socket = createSocket("wss://api.openai.com/v1/live/sessions", {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        handshakeTimeout: LIVE_SESSION_TIMEOUT_MS,
        maxPayload: 1024 * 1024,
      });
      this.socket.on("open", () => this.onOpen());
      this.socket.on("message", (data: RawData) => this.onMessage(data));
      this.socket.on("error", () => this.fail("live-connection-error"));
      this.socket.on("close", () => {
        if (this.state === "closing" || this.state === "closed") {
          this.finish(false);
        } else {
          this.fail("live-connection-closed");
        }
      });
    } catch {
      this.fail("live-connection-error");
    }

    return this.startPromise;
  }

  writeAudio(audio: Buffer): void {
    if (this.state !== "running" || audio.length === 0) return;
    // Preserve a split 16-bit sample across arbitrary input chunk boundaries.
    const bytes = this.pendingByte.length
      ? Buffer.concat([this.pendingByte, audio])
      : audio;
    const completeLength = bytes.length - (bytes.length % 2);
    this.pendingByte = Buffer.from(bytes.subarray(completeLength));
    if (completeLength === 0) return;

    this.send({
      type: "session.input_audio.append",
      audio: bytes.subarray(0, completeLength).toString("base64"),
    });
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = new Promise<void>((resolve) => {
      this.resolveClose = resolve;
    });
    if (this.state !== "running") {
      this.rejectStart?.(new Error("Live session closed during startup."));
      this.finish(true);
      return this.closePromise;
    }

    this.state = "closing";
    this.pendingByte = Buffer.alloc(0);
    this.armCloseTimeout();
    this.send({ type: "session.close" });
    return this.closePromise;
  }

  private onOpen(): void {
    if (this.state !== "starting") return;
    // Live uses its own continuous audio protocol, not Realtime turn events.
    this.send({
      type: "session.start",
      event_id: "start",
      session: {
        model: "gpt-live-1",
        store: false,
        instructions:
          "You are a friendly AI assistant talking with a phone-radio caller. " +
          "Answer questions and chat naturally, usually in a few short sentences. " +
          "You cannot transfer calls, control music, browse, or perform external actions. " +
          "Pressing 9 returns the caller to the radio menu.\n\n" +
          "Backchannel policy: Occasionally acknowledge the caller briefly without taking over their turn.\n\n" +
          "Interruption policy: When the caller interrupts, stop your answer and listen. Brief listening sounds are okay.\n\n" +
          "Delegation policy:\n" +
          "Backend tools: None. The backend can reason and answer questions.\n" +
          "Delegate to the backend when: A question needs calculations, multiple reasoning steps, or a detailed explanation.\n" +
          "Do not delegate to the backend when: Greeting, chatting casually, or answering a simple question.",
        audio: {
          format: { type: "audio/pcm", rate: 16000 },
          output: { voice: "marin" },
        },
        delegation: {
          type: "responses",
          responses: {
            model: "gpt-5.6-luna",
            instructions:
              "Answer the caller's question clearly and briefly. " +
              "No tools or external actions are available. " +
              "Do not claim to have searched the web or performed an action.",
            tools: [],
            tool_choice: "none",
          },
        },
      },
    });
  }

  private onMessage(data: RawData): void {
    if (this.state === "closed") return;
    let event: Record<string, unknown> | null;
    try {
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      event = asRecord(JSON.parse(bytes.toString()));
      if (!event || typeof event.type !== "string") {
        this.fail("live-invalid-event");
        return;
      }
    } catch {
      this.fail("live-invalid-event");
      return;
    }

    switch (event.type) {
      case "session.started":
        if (this.state !== "starting") return;
        this.clearStartTimer();
        this.state = "running";
        if (
          this.send({
            type: "session.instructions.append",
            event_id: "greeting",
            delegation_id: null,
            content:
              "Greet the caller now in English. Introduce yourself as their AI " +
              "assistant, say they can ask you questions or chat, and mention " +
              "that pressing 9 returns to the radio menu. Then pause and listen.",
          })
        ) {
          this.resolveStart?.();
          this.resolveStart = null;
          this.rejectStart = null;
        }
        break;
      case "session.output_audio.delta": {
        if (this.state !== "running") return;
        if (
          typeof event.delta !== "string" ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            event.delta,
          )
        ) {
          this.fail("live-invalid-audio");
          return;
        }
        const audio = Buffer.from(event.delta, "base64");
        if (audio.length % 2 !== 0) {
          this.fail("live-invalid-audio");
          return;
        }
        if (audio.length) this.options.onAudio(audio);
        break;
      }
      case "session.usage.updated":
        this.reportUsage(event.usage);
        break;
      case "session.closed": {
        const requested = this.state === "closing";
        this.finalizationConfirmed = true;
        this.reportUsage(event.usage);
        this.rejectStart?.(new Error("Live session ended during startup."));
        this.clearStartTimer();
        this.state = "closing";
        this.armCloseTimeout();
        this.socket?.close();
        if (!requested) this.reportFailure("live-session-ended");
        break;
      }
      case "error":
        // Closing rejects pending instructions and Responses commands. Keep
        // draining until session.closed confirms usage, or the timeout expires.
        if (this.state !== "closing") this.fail("live-session-error");
        break;
      case "response.event": {
        const backendEvent = asRecord(event.event);
        if (
          backendEvent?.type === "error" ||
          backendEvent?.type === "response.failed"
        ) {
          if (this.state !== "closing") this.fail("live-backend-error");
        }
        break;
      }
      // Transcript and backend text events are deliberately neither stored nor logged.
    }
  }

  private reportUsage(value: unknown): void {
    const seconds = asRecord(value)?.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
      this.options.onUsage?.(seconds);
    }
  }

  private send(event: Record<string, unknown>): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.fail("live-connection-unavailable");
      return false;
    }
    const payload = JSON.stringify(event);
    if (this.socket.bufferedAmount + Buffer.byteLength(payload) > LIVE_MAX_BUFFERED_BYTES) {
      this.fail("live-audio-backpressure");
      return false;
    }
    try {
      this.socket.send(payload, (error?: Error) => {
        if (error) this.fail("live-send-error");
      });
      return this.state !== "closed";
    } catch {
      this.fail("live-send-error");
      return false;
    }
  }

  private fail(reason: string): void {
    if (this.state === "closed") return;
    const requestedClose = this.state === "closing";
    this.rejectStart?.(new Error(reason));
    this.finish(true);
    if (!requestedClose) this.reportFailure(reason);
  }

  private reportFailure(reason: string): void {
    if (this.failureReported) return;
    this.failureReported = true;
    this.options.onFailure(reason);
  }

  private armCloseTimeout(): void {
    if (this.closeTimer) return;
    this.closeTimer = setTimeout(() => this.finish(true), LIVE_SESSION_TIMEOUT_MS);
    this.closeTimer.unref();
  }

  private clearStartTimer(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
  }

  private finish(terminate: boolean): void {
    const reportFinalization = !this.finalizationReported;
    this.finalizationReported = true;
    this.state = "closed";
    this.clearStartTimer();
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.pendingByte = Buffer.alloc(0);
    this.resolveStart = null;
    this.rejectStart = null;
    if (terminate && this.socket?.readyState !== WebSocket.CLOSED) {
      this.socket?.terminate();
    }
    this.resolveClose?.();
    this.resolveClose = null;
    if (reportFinalization) {
      this.options.onFinalization?.(this.finalizationConfirmed);
    }
  }
}
