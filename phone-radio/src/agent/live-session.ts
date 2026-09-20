import WebSocket, { type ClientOptions, type RawData } from "ws";
import type { AgentVoiceSession } from "./bridge-manager.js";

export const LIVE_SESSION_TIMEOUT_MS = 15_000;
// Accommodates the bridge's bounded 15-second startup buffer after base64 encoding.
export const LIVE_MAX_BUFFERED_BYTES = 1024 * 1024;
export const LIVE_TOOL_TIMEOUT_MS = 180_000;
const MAX_TOOL_ARGUMENT_BYTES = 16 * 1024;
const MAX_TOOL_RESULT_BYTES = 64 * 1024;
const MAX_TOOL_CALLS = 128;
const MAX_BACKEND_RESPONSES = 512;

export type LiveTools = Readonly<{
  definitions: Array<Record<string, unknown>>;
  instructions: string;
  execute: (name: string, args: unknown, signal: AbortSignal) => Promise<unknown>;
}>;

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
  tools?: LiveTools;
  socketFactory?: (url: string, options: ClientOptions) => LiveSocket;
}>;

type SessionState = "idle" | "starting" | "running" | "closing" | "closed";

type ToolCall = { id: string; name: string; arguments: string; output?: string };
type BackendResponse = {
  id: string;
  delegationId: string;
  calls: ToolCall[];
  completed: boolean;
  controller: AbortController;
};

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
  private readonly toolAbort = new AbortController();
  private readonly responses = new Map<string, BackendResponse>();
  private readonly responseByDelegation = new Map<string, string>();
  private readonly toolCalls = new Map<string, ToolCall>();
  private toolQueue: Promise<void> = Promise.resolve();

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
    this.toolAbort.abort();
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
          (this.options.tools
            ? "Your backend can search for songs and add, move, or remove songs in radio playlists. " +
              "Always delegate playlist requests and report success only after a tool confirms it. " +
              "Ask for a song or playlist when the request is ambiguous. " +
              "You cannot transfer calls or perform other external actions. "
            : "You cannot transfer calls, control music, browse, or perform external actions. ") +
          "Pressing 9 returns the caller to the radio menu.\n\n" +
          "Backchannel policy: Occasionally acknowledge the caller briefly without taking over their turn.\n\n" +
          "Interruption policy: When the caller interrupts, stop your answer and listen. Brief listening sounds are okay.\n\n" +
          "Delegation policy:\n" +
          (this.options.tools
            ? "Backend tools: Search and inspect radio playlists; download/add, move, and remove songs using the add-phone-radio-song skill.\n" +
              "Delegate to the backend when: The caller asks about songs or playlists, requests a playlist change, " +
              "or needs calculations, multiple reasoning steps, or a detailed explanation.\n"
            : "Backend tools: None. The backend can reason and answer questions.\n" +
              "Delegate to the backend when: A question needs calculations, multiple reasoning steps, or a detailed explanation.\n") +
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
              (this.options.tools
                ? this.options.tools.instructions
                : "No tools or external actions are available. " +
                  "Do not claim to have searched the web or performed an action."),
            tools: this.options.tools?.definitions ?? [],
            tool_choice: this.options.tools ? "auto" : "none",
            ...(this.options.tools ? { parallel_tool_calls: false } : {}),
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
              "assistant, say they can ask you questions or chat" +
              (this.options.tools ? ", search for songs, or edit playlists" : "") +
              ", and mention " +
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
        this.toolAbort.abort();
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
        } else if (backendEvent && this.options.tools && this.state === "running") {
          this.onBackendEvent(event, backendEvent);
        }
        break;
      }
      // Transcript and backend text events are deliberately neither stored nor logged.
    }
  }

  private onBackendEvent(envelope: Record<string, unknown>, event: Record<string, unknown>): void {
    const delegationId = envelope.delegation_id;
    if (typeof delegationId !== "string" || !delegationId) return;
    const response = asRecord(event.response);
    if (event.type === "response.created") {
      const id = response?.id;
      if (typeof id !== "string" || !id || this.responses.has(id)) return;
      if (this.responses.size >= MAX_BACKEND_RESPONSES) {
        this.fail("live-tool-limit");
        return;
      }
      this.responses.set(id, { id, delegationId, calls: [], completed: false, controller: new AbortController() });
      this.responseByDelegation.set(delegationId, id);
      return;
    }

    // Some output-item events omit response_id. The enclosing delegation and
    // its last response.created identify them; lifecycle events carry response.id.
    const id = typeof event.response_id === "string" ? event.response_id
      : typeof response?.id === "string" ? response.id
        : this.responseByDelegation.get(delegationId);
    const pending = id ? this.responses.get(id) : undefined;
    if (!pending || pending.delegationId !== delegationId) return;
    if (event.type === "response.incomplete" || event.type === "response.cancelled") {
      pending.completed = true;
      pending.controller.abort();
      return;
    }
    if (pending.completed) return;

    if (event.type === "response.output_item.done") {
      const item = asRecord(event.item);
      if (item?.type !== "function_call") return;
      if (typeof item.call_id !== "string" || !item.call_id || typeof item.name !== "string" ||
          typeof item.arguments !== "string") {
        this.fail("live-invalid-tool-call");
        return;
      }
      if (pending.calls.some((call) => call.id === item.call_id)) return;
      if (pending.calls.length >= 8 || Buffer.byteLength(item.arguments) > MAX_TOOL_ARGUMENT_BYTES) {
        this.fail("live-tool-limit");
        return;
      }
      let call = this.toolCalls.get(item.call_id);
      if (call && (call.name !== item.name || call.arguments !== item.arguments)) {
        // Never run a different mutation under an already-seen operation ID.
        this.fail("live-invalid-tool-call");
        return;
      }
      if (!call) {
        if (this.toolCalls.size >= MAX_TOOL_CALLS) {
          this.fail("live-tool-limit");
          return;
        }
        call = { id: item.call_id, name: item.name, arguments: item.arguments };
        this.toolCalls.set(call.id, call);
      }
      pending.calls.push(call);
    } else if (event.type === "response.completed") {
      pending.completed = true;
      if (response?.status && response.status !== "completed") {
        pending.controller.abort();
        return;
      }
      if (!pending.calls.length) return;
      // Audio continues while tools run. Serialize batches to preserve mutation
      // order, including backend responses from separate delegations.
      this.toolQueue = this.toolQueue.then(() => this.fulfillTools(pending)).catch(() => {
        if (this.state === "running") this.fail("live-tool-protocol-error");
      });
    }
  }

  private async fulfillTools(response: BackendResponse): Promise<void> {
    const signal = AbortSignal.any([this.toolAbort.signal, response.controller.signal]);
    for (const call of response.calls) {
      if (this.state !== "running" || signal.aborted) return;
      call.output ??= await this.executeTool(call, signal);
      if (this.state !== "running" || signal.aborted) return;
      if (!this.send({
        type: "response.item.create",
        event_id: `tool_${response.id}_${call.id}`,
        item: { type: "function_call_output", call_id: call.id, output: call.output },
      })) return;
    }
    if (this.state === "running" && !signal.aborted) {
      this.send({ type: "response.create", event_id: `continue_${response.id}` });
    }
  }

  private async executeTool(call: ToolCall, parentSignal: AbortSignal): Promise<string> {
    const tools = this.options.tools!;
    if (!tools.definitions.some((tool) => tool.type === "function" && tool.name === call.name)) {
      return JSON.stringify({ ok: false, error: "unknown_tool", message: "That tool is not available." });
    }
    let args: unknown;
    try { args = JSON.parse(call.arguments); }
    catch {
      return JSON.stringify({ ok: false, error: "invalid_arguments", message: "Tool arguments must be valid JSON." });
    }
    const timeout = new AbortController();
    const signal = AbortSignal.any([parentSignal, timeout.signal]);
    let onAbort: (() => void) | undefined;
    const timer = setTimeout(() => timeout.abort(), LIVE_TOOL_TIMEOUT_MS);
    timer.unref();
    try {
      signal.throwIfAborted();
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("Tool cancelled."));
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const result = await Promise.race([tools.execute(call.name, args, signal), aborted]);
      const output = JSON.stringify(result ?? null);
      if (Buffer.byteLength(output) > MAX_TOOL_RESULT_BYTES) {
        return JSON.stringify({ ok: false, error: "tool_result_too_large", message: "The operation returned too much data. Check its current state before retrying." });
      }
      return output;
    } catch {
      return JSON.stringify({
        ok: false,
        error: timeout.signal.aborted ? "tool_timeout" : signal.aborted ? "tool_cancelled" : "tool_failed",
        message: "The operation could not be confirmed. Check the playlist before retrying a change.",
      });
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
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
    this.toolAbort.abort();
    this.responses.clear();
    this.responseByDelegation.clear();
    this.toolCalls.clear();
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
