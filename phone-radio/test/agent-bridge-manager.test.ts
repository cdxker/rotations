import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_MAX_OUTPUT_AUDIO_BYTES,
  AGENT_MAX_STARTUP_AUDIO_BYTES,
  AgentBridgeManager,
  type AgentVoiceSession,
  type AgentVoiceSessionOptions,
} from "../src/agent/bridge-manager.js";

class FakePhone extends EventEmitter {
  readyState = WebSocket.OPEN as number;
  bufferedAmount = 0;
  send = vi.fn((_data: Buffer | string, callback?: (error?: Error) => void) => callback?.());
  close = vi.fn((_code?: number, _reason?: string) => {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  });

  get socket(): WebSocket { return this as unknown as WebSocket; }
  audio(audio: Buffer): void { this.emit("message", audio, true); }
  digit(digit: string): void {
    this.emit("message", Buffer.from(JSON.stringify({ event: "websocket:dtmf", digit })), false);
  }
  get frames(): Buffer[] {
    return this.send.mock.calls.map(([data]) => data).filter(Buffer.isBuffer);
  }
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const managers: AgentBridgeManager[] = [];

function fixture(start: () => Promise<void> = async () => undefined) {
  const callbacks: AgentVoiceSessionOptions[] = [];
  const sessions: AgentVoiceSession[] = [];
  const onExit = vi.fn(async () => undefined);
  const onFailure = vi.fn(async () => undefined);
  const onClosed = vi.fn();
  const createSession = vi.fn((options: AgentVoiceSessionOptions) => {
    callbacks.push(options);
    const session: AgentVoiceSession = {
      start: vi.fn(start),
      writeAudio: vi.fn(),
      close: vi.fn(async () => undefined),
    };
    sessions.push(session);
    return session;
  });
  const manager = new AgentBridgeManager({ createSession, onExit, onFailure, onClosed });
  managers.push(manager);
  return { manager, createSession, callbacks, sessions, onExit, onFailure, onClosed };
}

describe("AgentBridgeManager", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(async () => {
    await Promise.all(managers.splice(0).map((manager) => manager.close()));
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("consumes only a matching reservation and rejects duplicate attaches", async () => {
    const { manager, createSession, onFailure } = fixture();
    const unreservedPhone = new FakePhone();
    expect(await manager.attach("call-1", "session-1", unreservedPhone.socket)).toBe(false);
    expect(unreservedPhone.close).toHaveBeenCalledExactlyOnceWith(1008, "Agent session is not reserved");
    manager.reserve("call-1", "session-1");
    const stalePhone = new FakePhone();
    expect(await manager.attach("call-1", "wrong-generation", stalePhone.socket)).toBe(false);
    expect(stalePhone.close).toHaveBeenCalledExactlyOnceWith(1008, "Agent session is not reserved");
    expect(manager.hasReservation("call-1", "session-1")).toBe(true);
    const phone = new FakePhone();
    expect(await manager.attach("call-1", "session-1", phone.socket)).toBe(true);
    expect(manager.hasReservation("call-1", "session-1")).toBe(false);
    expect(await manager.attach("call-1", "session-1", new FakePhone().socket)).toBe(false);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("expires an unused reservation once and invokes failure before metadata cleanup", async () => {
    const { manager, onFailure, onClosed } = fixture();
    manager.reserve("call-1", "session-1");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(manager.hasReservation("call-1", "session-1")).toBe(false);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("call-1", "session-1", "Agent phone connection timed out.");
    expect(onClosed).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
    expect(onFailure.mock.invocationCallOrder[0]).toBeLessThan(onClosed.mock.invocationCallOrder[0]!);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("retains caller audio and the greeting while provider startup is pending", async () => {
    const connection = deferred();
    const { manager, callbacks, sessions } = fixture(() => connection.promise);
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    const attaching = manager.attach("call-1", "session-1", phone.socket);
    const first = Buffer.alloc(640, 1);
    const second = Buffer.alloc(640, 2);
    phone.audio(first);
    phone.audio(second);
    callbacks[0]!.onAudio(Buffer.alloc(640, 3));
    expect(sessions[0]!.writeAudio).not.toHaveBeenCalled();
    connection.resolve();
    expect(await attaching).toBe(true);
    expect(sessions[0]!.writeAudio).toHaveBeenNthCalledWith(1, first);
    expect(sessions[0]!.writeAudio).toHaveBeenNthCalledWith(2, second);
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames).toEqual([Buffer.alloc(640, 3)]);
    const third = Buffer.alloc(640, 4);
    phone.audio(third);
    expect(sessions[0]!.writeAudio).toHaveBeenNthCalledWith(3, third);
  });

  it("assembles partial output, sends one frame per 20 ms, and pads the final PCM fragment", async () => {
    const { manager, callbacks } = fixture();
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    await manager.attach("call-1", "session-1", phone.socket);
    callbacks[0]!.onAudio(Buffer.alloc(637, 1));
    callbacks[0]!.onAudio(Buffer.alloc(643, 2));
    expect(phone.frames).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames).toEqual([Buffer.concat([Buffer.alloc(637, 1), Buffer.alloc(3, 2)])]);
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames[1]).toEqual(Buffer.alloc(640, 2));
    callbacks[0]!.onAudio(Buffer.alloc(100, 3));
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames[2]).toEqual(Buffer.concat([Buffer.alloc(100, 3), Buffer.alloc(540)]));
  });

  it("handles digit 9 once, clears audio, and finishes call-state changes before closing the phone", async () => {
    const transition = deferred();
    const { manager, callbacks, sessions, onExit, onFailure, onClosed } = fixture();
    onExit.mockImplementation(() => transition.promise);
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    await manager.attach("call-1", "session-1", phone.socket);
    callbacks[0]!.onAudio(Buffer.alloc(1280, 1));
    phone.digit("#");
    phone.digit("1");
    expect(onExit).not.toHaveBeenCalled();
    phone.digit("9");
    phone.digit("9");
    callbacks[0]!.onFailure("late failure");
    expect(onExit).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
    expect(phone.send).toHaveBeenCalledWith(JSON.stringify({ action: "clear" }));
    expect(phone.close).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(phone.frames).toHaveLength(0);
    transition.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(sessions[0]!.close).toHaveBeenCalledTimes(1);
    expect(phone.close).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("catches up after timer drift with at most five frames and resets pacing after idle", async () => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const { manager, callbacks } = fixture();
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    await manager.attach("call-1", "session-1", phone.socket);
    callbacks[0]!.onAudio(Buffer.alloc(640 * 8, 1));
    expect(phone.frames).toHaveLength(0);
    elapsed = 20;
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames).toHaveLength(1);
    // The event loop stalled: 140 ms elapsed before its next 20 ms timer ran.
    elapsed = 160;
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames).toHaveLength(6);
    elapsed = 180;
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames).toHaveLength(8);
    elapsed = 10_000;
    callbacks[0]!.onAudio(Buffer.alloc(640 * 3, 2));
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames).toHaveLength(8);
    elapsed = 10_020;
    await vi.advanceTimersByTimeAsync(20);
    expect(phone.frames).toHaveLength(9);
  });

  it("allows an exit during startup and ignores a later start rejection", async () => {
    const connection = deferred();
    const transition = deferred();
    const { manager, onExit, onFailure } = fixture(() => connection.promise);
    onExit.mockImplementation(() => transition.promise);
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    const attaching = manager.attach("call-1", "session-1", phone.socket);
    phone.digit("9");
    expect(await attaching).toBe(false);
    expect(phone.close).not.toHaveBeenCalled();
    connection.reject(new Error("closed during connection"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(phone.close).not.toHaveBeenCalled();
    transition.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(phone.close).toHaveBeenCalledExactlyOnceWith(1000, "Agent session ended");
  });

  it("keeps callers private and prevents an old release or socket event from closing a new generation", async () => {
    const { manager, callbacks, sessions, onFailure } = fixture();
    const oldPhone = new FakePhone();
    const nextPhone = new FakePhone();
    const otherPhone = new FakePhone();
    manager.reserve("call-1", "old");
    await manager.attach("call-1", "old", oldPhone.socket);
    manager.reserve("call-1", "new");
    await manager.attach("call-1", "new", nextPhone.socket);
    manager.reserve("call-2", "other");
    await manager.attach("call-2", "other", otherPhone.socket);
    await manager.release("call-1", "old");
    oldPhone.emit("close");
    callbacks[0]!.onFailure("stale failure");
    callbacks[0]!.onAudio(Buffer.alloc(640, 1));
    callbacks[1]!.onAudio(Buffer.alloc(640, 2));
    callbacks[2]!.onAudio(Buffer.alloc(640, 3));
    nextPhone.audio(Buffer.alloc(640, 4));
    await vi.advanceTimersByTimeAsync(20);
    expect(nextPhone.frames).toEqual([Buffer.alloc(640, 2)]);
    expect(otherPhone.frames).toEqual([Buffer.alloc(640, 3)]);
    expect(sessions[1]!.writeAudio).toHaveBeenCalledExactlyOnceWith(Buffer.alloc(640, 4));
    expect(sessions[2]!.writeAudio).not.toHaveBeenCalled();
    expect(nextPhone.close).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("closes a provider on phone hangup without triggering a fallback, even if startup rejects later", async () => {
    const connection = deferred();
    const { manager, callbacks, sessions, onFailure, onClosed } = fixture(() => connection.promise);
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    const attaching = manager.attach("call-1", "session-1", phone.socket);
    phone.close();
    expect(await attaching).toBe(false);
    connection.reject(new Error("late rejection"));
    callbacks[0]!.onFailure("late close error");
    await vi.advanceTimersByTimeAsync(0);
    expect(sessions[0]!.close).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles a hung startup after 15 seconds and reports only one failure", async () => {
    const connection = deferred();
    const { manager, callbacks, sessions, onFailure } = fixture(() => connection.promise);
    manager.reserve("call-1", "session-1");
    const attaching = manager.attach("call-1", "session-1", new FakePhone().socket);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await attaching).toBe(false);
    callbacks[0]!.onFailure("duplicate failure");
    connection.reject(new Error("late rejection"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("call-1", "session-1", "Agent connection timed out.");
    expect(sessions[0]!.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds startup audio without silently dropping caller speech", async () => {
    const { manager, onFailure, sessions } = fixture(() => new Promise(() => undefined));
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    const attaching = manager.attach("call-1", "session-1", phone.socket);
    phone.audio(Buffer.alloc(AGENT_MAX_STARTUP_AUDIO_BYTES));
    expect(onFailure).not.toHaveBeenCalled();
    phone.audio(Buffer.alloc(2));
    expect(await attaching).toBe(false);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("call-1", "session-1", "Agent startup audio buffer exceeded.");
    expect(sessions[0]!.writeAudio).not.toHaveBeenCalled();
  });

  it.each(["provider", "phone"])("fails explicitly when %s output exceeds its audio buffer", async (source) => {
    const { manager, callbacks, onFailure } = fixture();
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    await manager.attach("call-1", "session-1", phone.socket);
    if (source === "phone") phone.bufferedAmount = AGENT_MAX_OUTPUT_AUDIO_BYTES;
    callbacks[0]!.onAudio(Buffer.alloc(source === "provider" ? AGENT_MAX_OUTPUT_AUDIO_BYTES + 2 : 640));
    await vi.advanceTimersByTimeAsync(20);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(phone.frames).toHaveLength(0);
    expect(phone.close).toHaveBeenCalledTimes(1);
  });

  it("closes active sessions, cancels reservations, and clears every timer on shutdown", async () => {
    const { manager, sessions, onFailure, onClosed } = fixture();
    const phone = new FakePhone();
    manager.reserve("call-1", "session-1");
    await manager.attach("call-1", "session-1", phone.socket);
    manager.reserve("call-2", "session-2");
    await manager.close();
    expect(sessions[0]!.close).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(2);
    expect(onFailure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(await manager.attach("call-2", "session-2", new FakePhone().socket)).toBe(false);
    expect(() => manager.reserve("call-3", "session-3")).toThrow("closed");
  });
});
