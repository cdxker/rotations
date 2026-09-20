import { WebSocket, type RawData } from "ws";

export const AGENT_BRIDGE_CONNECTION_TIMEOUT_MS = 15_000;
export const AGENT_PCM_FRAME_BYTES = 640;
export const AGENT_PCM_FRAME_DURATION_MS = 20;
export const AGENT_MAX_STARTUP_AUDIO_BYTES = 16_000 * 2 * 15;
export const AGENT_MAX_OUTPUT_AUDIO_BYTES = 16_000 * 2 * 2;

export interface AgentVoiceSession {
  start(): Promise<void>;
  writeAudio(audio: Buffer): void;
  close(): Promise<void>;
}

export type AgentVoiceSessionOptions = {
  uuid: string;
  sessionId: string;
  onAudio: (audio: Buffer) => void;
  onFailure: (reason: string) => void;
};

type Reservation = {
  sessionId: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};

type ActiveSession = {
  uuid: string;
  sessionId: string;
  phone: WebSocket;
  provider: AgentVoiceSession | null;
  ready: boolean;
  ended: boolean;
  startupAudio: Buffer[];
  startupBytes: number;
  output: Buffer;
  lastOutputAt: number;
  nextOutputAt: number | null;
  connectionTimer: ReturnType<typeof setTimeout> | null;
  outputTimer: ReturnType<typeof setInterval> | null;
  settleAttach: (attached: boolean) => void;
  onMessage: (data: RawData, isBinary: boolean) => void;
};

type ManagerOptions = {
  createSession: (options: AgentVoiceSessionOptions) => AgentVoiceSession;
  onExit: (uuid: string, sessionId: string) => Promise<void>;
  onFailure: (uuid: string, sessionId: string, reason: string) => Promise<void>;
  onClosed?: (uuid: string, sessionId: string) => void;
};

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/** One private provider session per call, guarded by a unique menu generation. */
export class AgentBridgeManager {
  readonly #options: ManagerOptions;
  readonly #reservations = new Map<string, Reservation>();
  readonly #active = new Map<string, ActiveSession>();
  readonly #closing = new Set<Promise<void>>();
  #closed = false;

  constructor(options: ManagerOptions) {
    this.#options = options;
  }

  public reserve(uuid: string, sessionId: string): void {
    if (this.#closed) throw new Error("Agent bridge manager is closed.");
    if (!uuid.trim() || !sessionId.trim()) {
      throw new TypeError("Agent call UUID and session ID must be non-empty.");
    }

    const previous = this.#reservations.get(uuid);
    if (previous) {
      this.cancelReservation(uuid, previous);
      this.notifyClosed(uuid, previous.sessionId);
    }
    const active = this.#active.get(uuid);
    if (active) this.track(this.finish(active, "release"));

    const reservation: Reservation = {
      sessionId,
      expiresAt: Date.now() + AGENT_BRIDGE_CONNECTION_TIMEOUT_MS,
      timer: setTimeout(() => {
        this.expireReservation(uuid, reservation);
      }, AGENT_BRIDGE_CONNECTION_TIMEOUT_MS),
    };
    this.#reservations.set(uuid, reservation);
  }

  public hasReservation(uuid: string, sessionId: string): boolean {
    const reservation = this.#reservations.get(uuid);
    if (!reservation || reservation.sessionId !== sessionId) return false;
    if (reservation.expiresAt <= Date.now()) {
      this.expireReservation(uuid, reservation);
      return false;
    }
    return true;
  }

  public async attach(
    uuid: string,
    sessionId: string,
    phone: WebSocket,
  ): Promise<boolean> {
    if (this.#closed || !this.hasReservation(uuid, sessionId)) {
      try { phone.close(1008, "Agent session is not reserved"); } catch { /* Already closing. */ }
      return false;
    }
    const reservation = this.#reservations.get(uuid)!;
    this.cancelReservation(uuid, reservation);

    let settleAttach!: (attached: boolean) => void;
    const attached = new Promise<boolean>((resolve) => { settleAttach = resolve; });
    const active: ActiveSession = {
      uuid,
      sessionId,
      phone,
      provider: null,
      ready: false,
      ended: false,
      startupAudio: [],
      startupBytes: 0,
      output: Buffer.alloc(0),
      lastOutputAt: 0,
      nextOutputAt: null,
      connectionTimer: null,
      outputTimer: null,
      settleAttach,
      onMessage: (data, isBinary) => this.receivePhone(active, data, isBinary),
    };
    this.#active.set(uuid, active);

    // Vonage can send audio and digits while the provider is still connecting.
    phone.on("message", active.onMessage);
    phone.once("close", () => { this.track(this.finish(active, "hangup")); });
    phone.on("error", () => { this.track(this.finish(active, "hangup")); });
    if (phone.readyState !== WebSocket.OPEN) {
      this.track(this.finish(active, "hangup"));
      return attached;
    }

    active.connectionTimer = setTimeout(() => {
      this.track(this.finish(active, "failure", "Agent connection timed out."));
    }, AGENT_BRIDGE_CONNECTION_TIMEOUT_MS);
    active.outputTimer = setInterval(() => {
      this.sendOutput(active);
    }, AGENT_PCM_FRAME_DURATION_MS);

    try {
      active.provider = this.#options.createSession({
        uuid,
        sessionId,
        onAudio: (audio) => this.receiveOutput(active, audio),
        onFailure: (reason) => {
          this.track(this.finish(active, "failure", reason));
        },
      });
      if (active.ended) {
        this.track(active.provider.close());
        return attached;
      }
      void active.provider.start().then(() => {
        if (active.ended) return;
        if (active.connectionTimer) clearTimeout(active.connectionTimer);
        active.connectionTimer = null;
        active.ready = true;
        const buffered = active.startupAudio;
        active.startupAudio = [];
        active.startupBytes = 0;
        for (const audio of buffered) {
          if (active.ended) return;
          active.provider!.writeAudio(audio);
        }
        active.settleAttach(true);
      }).catch(() => {
        this.track(this.finish(active, "failure", "Agent connection failed."));
      });
    } catch {
      this.track(this.finish(active, "failure", "Agent connection failed."));
    }

    return attached;
  }

  public async release(uuid: string, sessionId: string): Promise<void> {
    const reservation = this.#reservations.get(uuid);
    if (reservation?.sessionId === sessionId) {
      this.cancelReservation(uuid, reservation);
      this.notifyClosed(uuid, sessionId);
    }
    const active = this.#active.get(uuid);
    if (active?.sessionId === sessionId) {
      await this.finish(active, "release");
    }
  }

  public async close(): Promise<void> {
    this.#closed = true;
    for (const [uuid, reservation] of this.#reservations) {
      this.cancelReservation(uuid, reservation);
      this.notifyClosed(uuid, reservation.sessionId);
    }
    for (const active of this.#active.values()) {
      this.track(this.finish(active, "release"));
    }
    await Promise.all([...this.#closing]);
  }

  private receivePhone(active: ActiveSession, data: RawData, isBinary: boolean): void {
    if (active.ended) return;
    if (!isBinary) {
      try {
        const event = JSON.parse(toBuffer(data).toString("utf8")) as {
          event?: string;
          digit?: string;
        };
        if (event.event === "websocket:dtmf" && event.digit === "9") {
          this.track(this.finish(active, "exit"));
        }
      } catch {
        // Vonage's non-DTMF metadata has no effect on the conversation.
      }
      return;
    }

    const audio = toBuffer(data);
    if (!active.ready) {
      if (active.startupBytes + audio.length > AGENT_MAX_STARTUP_AUDIO_BYTES) {
        this.track(this.finish(active, "failure", "Agent startup audio buffer exceeded."));
        return;
      }
      active.startupAudio.push(audio);
      active.startupBytes += audio.length;
      return;
    }
    try {
      active.provider!.writeAudio(audio);
    } catch {
      this.track(this.finish(active, "failure", "Agent audio input failed."));
    }
  }

  private receiveOutput(active: ActiveSession, audio: Buffer): void {
    if (active.ended || audio.length === 0) return;
    if (active.output.length + audio.length + active.phone.bufferedAmount > AGENT_MAX_OUTPUT_AUDIO_BYTES) {
      this.track(this.finish(active, "failure", "Agent audio output buffer exceeded."));
      return;
    }
    const now = performance.now();
    if (active.output.length === 0) active.nextOutputAt = now + AGENT_PCM_FRAME_DURATION_MS;
    active.output = Buffer.concat([active.output, audio]);
    active.lastOutputAt = now;
  }

  private sendOutput(active: ActiveSession): void {
    if (active.ended || active.output.length === 0) return;
    const now = performance.now();
    if (active.nextOutputAt === null || now < active.nextOutputAt) return;
    // A delayed timer must catch up with continuous live audio, without sending
    // more than 100 ms in one callback or banking credits while audio is idle.
    const dueFrames = Math.min(5, Math.floor((now - active.nextOutputAt) / AGENT_PCM_FRAME_DURATION_MS) + 1);
    for (let index = 0; index < dueFrames; index += 1) {
      if (!this.sendOutputFrame(active, now)) return;
      if (active.output.length === 0) {
        active.nextOutputAt = null;
        return;
      }
      active.nextOutputAt += AGENT_PCM_FRAME_DURATION_MS;
    }
  }

  private sendOutputFrame(active: ActiveSession, now: number): boolean {
    if (active.ended) return false;
    if (active.phone.readyState !== WebSocket.OPEN) {
      this.track(this.finish(active, "hangup"));
      return false;
    }
    if (active.output.length + active.phone.bufferedAmount > AGENT_MAX_OUTPUT_AUDIO_BYTES) {
      this.track(this.finish(active, "failure", "Phone audio output buffer exceeded."));
      return false;
    }
    if (active.output.length < AGENT_PCM_FRAME_BYTES) {
      // Flush a final partial frame after one quiet tick, preserving PCM samples.
      if (now - active.lastOutputAt < AGENT_PCM_FRAME_DURATION_MS || active.output.length % 2 !== 0) {
        return false;
      }
    }
    const frame = Buffer.alloc(AGENT_PCM_FRAME_BYTES);
    active.output.copy(frame, 0, 0, AGENT_PCM_FRAME_BYTES);
    active.output = active.output.subarray(AGENT_PCM_FRAME_BYTES);
    try {
      active.phone.send(frame, (error) => {
        if (error) this.track(this.finish(active, "failure", "Phone audio output failed."));
      });
    } catch {
      this.track(this.finish(active, "failure", "Phone audio output failed."));
    }
    return !active.ended;
  }

  private async finish(
    active: ActiveSession,
    cause: "exit" | "failure" | "hangup" | "release",
    reason = "Agent connection failed.",
  ): Promise<void> {
    if (active.ended) return;
    active.ended = true;
    if (this.#active.get(active.uuid) === active) this.#active.delete(active.uuid);
    if (active.connectionTimer) clearTimeout(active.connectionTimer);
    if (active.outputTimer) clearInterval(active.outputTimer);
    active.connectionTimer = null;
    active.outputTimer = null;
    active.startupAudio = [];
    active.startupBytes = 0;
    active.output = Buffer.alloc(0);
    active.nextOutputAt = null;
    active.phone.off("message", active.onMessage);
    active.settleAttach(false);

    if (cause !== "hangup" && active.phone.readyState === WebSocket.OPEN) {
      try { active.phone.send(JSON.stringify({ action: "clear" })); } catch { /* Closing socket. */ }
    }
    // Start provider cleanup immediately; call-state callbacks precede phone close.
    const provider = active.provider;
    const closeProvider = Promise.resolve().then(() => provider?.close()).catch(() => undefined);
    try {
      if (cause === "exit") await this.#options.onExit(active.uuid, active.sessionId);
      if (cause === "failure") await this.#options.onFailure(active.uuid, active.sessionId, reason);
    } finally {
      if (active.phone.readyState === WebSocket.OPEN || active.phone.readyState === WebSocket.CONNECTING) {
        try { active.phone.close(1000, "Agent session ended"); } catch { /* Already closing. */ }
      }
      this.notifyClosed(active.uuid, active.sessionId);
      await closeProvider;
    }
  }

  private cancelReservation(uuid: string, reservation: Reservation): void {
    clearTimeout(reservation.timer);
    if (this.#reservations.get(uuid) === reservation) this.#reservations.delete(uuid);
  }

  private expireReservation(uuid: string, reservation: Reservation): void {
    if (this.#reservations.get(uuid) !== reservation) return;
    this.cancelReservation(uuid, reservation);
    this.track(Promise.resolve().then(() => this.#options.onFailure(
      uuid, reservation.sessionId, "Agent phone connection timed out.",
    )).finally(() => this.notifyClosed(uuid, reservation.sessionId)));
  }

  private notifyClosed(uuid: string, sessionId: string): void {
    this.#options.onClosed?.(uuid, sessionId);
  }

  private track(work: Promise<void>): void {
    const settled = work.catch(() => undefined);
    this.#closing.add(settled);
    void settled.then(() => { this.#closing.delete(settled); });
  }
}
