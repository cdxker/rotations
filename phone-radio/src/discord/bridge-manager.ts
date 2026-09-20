import type { DiscordVoiceDestination } from "./config.js";

export const DISCORD_BRIDGE_RESERVATION_MS = 15_000;
export const DISCORD_BRIDGE_MAX_PHONE_BUFFERED_BYTES = 64 * 1024;

export type BridgeReservation = Readonly<{
  destination: DiscordVoiceDestination;
  expiresAt: number;
  uuid: string;
}>;

export type PhoneBridgePeer = {
  readonly bufferedAmount?: number;
  close(code?: number, reason?: string): void;
  send(data: Buffer): void;
};

export interface DiscordBridgeSession {
  addPhoneCaller(uuid: string, peer: PhoneBridgePeer): void;
  close(): Promise<void> | void;
  enqueuePhoneAudio(uuid: string, audio: Buffer): void;
  removePhoneCaller(uuid: string): void;
}

export type DiscordBridgeSessionFactory = (
  destination: DiscordVoiceDestination,
) => Promise<DiscordBridgeSession>;

type ActiveSession = {
  destination: DiscordVoiceDestination;
  idleTimer: ReturnType<typeof setTimeout> | null;
  session: DiscordBridgeSession;
  callers: Set<string>;
};

export type AttachBridgeResult =
  | { kind: "attached"; destination: DiscordVoiceDestination }
  | { kind: "busy"; destination: DiscordVoiceDestination }
  | { kind: "rejected" };

/**
 * Owns short-lived Vonage reservations and the one-active-channel-per-guild
 * rule. Network and Discord media code stay behind DiscordBridgeSession.
 */
export class DiscordBridgeManager {
  readonly #activeByGuild = new Map<string, ActiveSession>();
  readonly #guildLocks = new Map<string, Promise<void>>();
  readonly #reservationMs: number;
  readonly #idleMs: number;
  readonly #reservations = new Map<string, BridgeReservation>();
  readonly #reservationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #createSession: DiscordBridgeSessionFactory;
  readonly #now: () => number;

  constructor({
    createSession,
    now = Date.now,
    idleMs = 30_000,
    reservationMs = DISCORD_BRIDGE_RESERVATION_MS,
  }: {
    createSession: DiscordBridgeSessionFactory;
    now?: () => number;
    idleMs?: number;
    reservationMs?: number;
  }) {
    if (!Number.isSafeInteger(reservationMs) || reservationMs <= 0) {
      throw new RangeError("Reservation duration must be a positive integer.");
    }
    if (!Number.isSafeInteger(idleMs) || idleMs <= 0) {
      throw new RangeError("Idle duration must be a positive integer.");
    }

    this.#createSession = createSession;
    this.#now = now;
    this.#reservationMs = reservationMs;
    this.#idleMs = idleMs;
  }

  public reserve(
    uuid: string,
    destination: DiscordVoiceDestination,
  ): BridgeReservation {
    this.assertUuid(uuid);
    this.pruneReservations();

    this.cancelReservation(uuid);
    const reservation = Object.freeze({
      destination,
      expiresAt: this.#now() + this.#reservationMs,
      uuid,
    });
    this.#reservations.set(uuid, reservation);
    this.#reservationTimers.set(
      uuid,
      setTimeout(() => {
        const current = this.#reservations.get(uuid);
        if (current === reservation) {
          this.#reservations.delete(uuid);
        }
        this.#reservationTimers.delete(uuid);
      }, this.#reservationMs),
    );
    return reservation;
  }

  public cancelReservation(uuid: string): boolean {
    const timer = this.#reservationTimers.get(uuid);
    if (timer) {
      clearTimeout(timer);
      this.#reservationTimers.delete(uuid);
    }
    return this.#reservations.delete(uuid);
  }

  public hasReservation(uuid: string): boolean {
    this.pruneReservations();
    return this.#reservations.has(uuid);
  }

  public async attach(
    uuid: string,
    peer: PhoneBridgePeer,
  ): Promise<AttachBridgeResult> {
    this.pruneReservations();
    const reservation = this.#reservations.get(uuid);

    if (!reservation) {
      return { kind: "rejected" };
    }

    this.cancelReservation(uuid);
    return this.withGuildLock(reservation.destination.guildId, async () => {
      const existing = this.#activeByGuild.get(reservation.destination.guildId);

      if (
        existing &&
        existing.destination.channelId !== reservation.destination.channelId
      ) {
        return { kind: "busy", destination: reservation.destination };
      }

      try {
        const active =
          existing ?? {
            callers: new Set<string>(),
            destination: reservation.destination,
            idleTimer: null,
            session: await this.#createSession(reservation.destination),
          };

        if (!existing) {
          this.#activeByGuild.set(reservation.destination.guildId, active);
        }

        active.callers.add(uuid);
        if (active.idleTimer) {
          clearTimeout(active.idleTimer);
          active.idleTimer = null;
        }
        active.session.addPhoneCaller(uuid, peer);
        return { kind: "attached", destination: active.destination };
      } catch (error) {
        if (!existing) {
          this.#activeByGuild.delete(reservation.destination.guildId);
        }
        throw error;
      }
    });
  }

  public async detach(uuid: string): Promise<void> {
    for (const [guildId, active] of this.#activeByGuild) {
      if (!active.callers.delete(uuid)) {
        continue;
      }

      active.session.removePhoneCaller(uuid);
      if (active.callers.size === 0 && !active.idleTimer) {
        active.idleTimer = setTimeout(() => {
          if (active.callers.size !== 0 || this.#activeByGuild.get(guildId) !== active) {
            return;
          }
          this.#activeByGuild.delete(guildId);
          void active.session.close();
        }, this.#idleMs);
      }
      return;
    }
  }

  public writePhoneAudio(uuid: string, audio: Buffer): boolean {
    for (const active of this.#activeByGuild.values()) {
      if (active.callers.has(uuid)) {
        active.session.enqueuePhoneAudio(uuid, audio);
        return true;
      }
    }
    return false;
  }

  public async close(): Promise<void> {
    const sessions = [...this.#activeByGuild.values()];
    this.#activeByGuild.clear();
    this.#reservations.clear();
    for (const timer of this.#reservationTimers.values()) {
      clearTimeout(timer);
    }
    this.#reservationTimers.clear();
    for (const active of sessions) {
      if (active.idleTimer) {
        clearTimeout(active.idleTimer);
      }
    }
    await Promise.all(sessions.map((active) => active.session.close()));
  }

  private pruneReservations(): void {
    const now = this.#now();
    for (const [uuid, reservation] of this.#reservations) {
      if (reservation.expiresAt <= now) {
        this.cancelReservation(uuid);
      }
    }
  }

  private assertUuid(uuid: string): void {
    if (typeof uuid !== "string" || uuid.trim().length === 0) {
      throw new TypeError("Bridge call UUID must be non-empty.");
    }
  }

  private async withGuildLock<T>(guildId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.#guildLocks.get(guildId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.#guildLocks.set(guildId, previous.then(() => current));
    await previous;
    try {
      return await work();
    } finally {
      release?.();
    }
  }
}
