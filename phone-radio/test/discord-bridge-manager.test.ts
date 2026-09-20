import { describe, expect, it, vi } from "vitest";
import {
  DiscordBridgeManager,
  type DiscordBridgeSession,
  type PhoneBridgePeer,
} from "../src/discord/bridge-manager.js";
import { buildDiscordBridgeNcco } from "../src/utils/buildDiscordBridgeNcco.js";

const destination = {
  channelId: "channel-a",
  code: "99",
  guildId: "guild-a",
  name: "Radio friends",
} as const;

function fakeSession(): DiscordBridgeSession {
  return {
    addPhoneCaller: vi.fn(),
    close: vi.fn(),
    enqueuePhoneAudio: vi.fn(),
    removePhoneCaller: vi.fn(),
  };
}

const peer: PhoneBridgePeer = { close: vi.fn(), send: vi.fn() };

describe("DiscordBridgeManager", () => {
  it("shares one same-channel session, locks conflicting guild channels, and keeps guilds independent", async () => {
    const sessions: DiscordBridgeSession[] = [];
    const manager = new DiscordBridgeManager({
      createSession: async () => {
        const session = fakeSession();
        sessions.push(session);
        return session;
      },
    });
    manager.reserve("call-1", destination);
    expect((await manager.attach("call-1", peer)).kind).toBe("attached");
    manager.reserve("call-2", destination);
    expect((await manager.attach("call-2", peer)).kind).toBe("attached");
    expect(sessions).toHaveLength(1);

    manager.reserve("call-3", { ...destination, channelId: "channel-b" });
    expect(await manager.attach("call-3", peer)).toMatchObject({ kind: "busy" });
    manager.reserve("call-4", { ...destination, guildId: "guild-b", channelId: "channel-b" });
    expect((await manager.attach("call-4", peer)).kind).toBe("attached");
    expect(sessions).toHaveLength(2);
  });

  it("rejects expired and unreserved upgrades", async () => {
    let now = 100;
    const manager = new DiscordBridgeManager({
      createSession: async () => fakeSession(),
      now: () => now,
      reservationMs: 15_000,
    });
    manager.reserve("call-1", destination);
    now += 15_000;
    expect(manager.hasReservation("call-1")).toBe(false);
    expect(await manager.attach("call-1", peer)).toEqual({ kind: "rejected" });
  });

  it("expires an unused reservation on its timer", () => {
    vi.useFakeTimers();
    const manager = new DiscordBridgeManager({
      createSession: async () => fakeSession(),
      reservationMs: 15_000,
    });

    manager.reserve("call-1", destination);
    expect(manager.hasReservation("call-1")).toBe(true);

    vi.advanceTimersByTime(15_000);
    expect(manager.hasReservation("call-1")).toBe(false);
    vi.useRealTimers();
  });

  it("closes an empty session after its idle timeout and clears timers on shutdown", async () => {
    vi.useFakeTimers();
    const session = fakeSession();
    const manager = new DiscordBridgeManager({
      createSession: async () => session,
      idleMs: 30_000,
    });

    manager.reserve("call-1", destination);
    await manager.attach("call-1", peer);
    await manager.detach("call-1");
    vi.advanceTimersByTime(30_000);
    expect(session.close).toHaveBeenCalledTimes(1);

    manager.reserve("call-2", destination);
    await manager.close();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("forwards phone PCM only to the attached session", async () => {
    const session = fakeSession();
    const manager = new DiscordBridgeManager({ createSession: async () => session });
    manager.reserve("call-1", destination);
    await manager.attach("call-1", peer);
    const audio = Buffer.alloc(640);
    expect(manager.writePhoneAudio("call-1", audio)).toBe(true);
    expect(session.enqueuePhoneAudio).toHaveBeenCalledWith("call-1", audio);
    expect(manager.writePhoneAudio("unknown", audio)).toBe(false);
  });
});

describe("Discord bridge NCCO", () => {
  it("subscribes to DTMF before connecting with custom websocket authorization", () => {
    const ncco = buildDiscordBridgeNcco({
      destinationName: "Radio friends",
      memberCount: 2,
      url: "https://radio.example.test",
      uuid: "call-1",
      websocketSecret: "secret-value",
    });
    expect(ncco[1]).toEqual({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: ["https://radio.example.test/input/digit?uuid=call-1"],
      eventMethod: "POST",
    });
    const endpoint = (ncco[2] as { endpoint: Array<Record<string, unknown>> }).endpoint[0];
    expect(endpoint).toMatchObject({
      type: "websocket",
      uri: "wss://radio.example.test/discord/audio?uuid=call-1",
      authorization: { type: "custom", value: "Bearer secret-value" },
    });
    expect(endpoint).not.toHaveProperty("headers");
  });

  it("uses singular member-count grammar before the bridge actions", () => {
    const ncco = buildDiscordBridgeNcco({
      destinationName: "Radio friends",
      memberCount: 1,
      url: "https://radio.example.test",
      uuid: "call-1",
      websocketSecret: "secret-value",
    });

    expect(ncco.map(({ action }) => action)).toEqual([
      "talk",
      "input",
      "connect",
    ]);
    expect(ncco[0]).toEqual({
      action: "talk",
      text: "There is 1 member in Radio friends. Connecting now.",
    });
  });
});
