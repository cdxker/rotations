import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const manager = vi.hoisted(() => ({ hasReservation: vi.fn(), attach: vi.fn(), close: vi.fn() }));
vi.mock("../src/agent/runtime.js", () => ({ agentBridgeManager: manager }));
vi.mock("../src/clients.js", () => ({
  discordBridgeManager: { close: vi.fn().mockResolvedValue(undefined), hasReservation: vi.fn() },
  redisClient: { disconnect: vi.fn() },
  discordRuntime: { stop: vi.fn() }, voiceClient: {},
}));
vi.mock("../src/env.js", () => ({
  agentConfig: { enabled: true, apiKey: "never-sent-to-phone", websocketSecret: "phone-secret" },
  discordBridgeConfig: { enabled: false }, env: { PORT: 0 },
}));
vi.mock("../src/playlist.service.js", () => ({ playlistService: {} }));
vi.mock("../src/routes.js", async () => {
  const { Router } = await import("express");
  return { routes: Router() };
});
vi.mock("../src/utils/buildTrackNcco.js", () => ({ buildTrackNcco: vi.fn() }));
import { createPhoneRadioServer, stopPhoneRadioServer } from "../src/index.js";

let server: ReturnType<typeof createPhoneRadioServer>;
let baseUrl: string;
const sockets: WebSocket[] = [];
beforeEach(async () => {
  vi.clearAllMocks();
  manager.hasReservation.mockReturnValue(true);
  manager.attach.mockResolvedValue(true);
  manager.close.mockResolvedValue();
  server = createPhoneRadioServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await stopPhoneRadioServer(server);
});
function connect(path: string, authorization?: string) {
  const socket = new WebSocket(baseUrl + path, { headers: authorization ? { Authorization: authorization } : {} });
  sockets.push(socket);
  return socket;
}

describe("agent WebSocket upgrades", () => {
  it("shuts down an open audio connection before awaiting HTTP close", async () => {
    const socket = connect("/agent/audio?uuid=call-1&sessionId=session-1", "Bearer phone-secret");
    await once(socket, "open");
    const closed = once(socket, "close");
    await stopPhoneRadioServer(server);
    await closed;
    expect(manager.close).toHaveBeenCalled();
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });
  it("authenticates and attaches the exact call reservation with Discord disabled", async () => {
    const socket = connect("/agent/audio?uuid=call-1&sessionId=session-1", "Bearer phone-secret");
    await once(socket, "open");
    expect(manager.hasReservation).toHaveBeenCalledWith("call-1", "session-1");
    expect(manager.attach).toHaveBeenCalledWith("call-1", "session-1", expect.any(Object));
  });
  it.each([undefined, "Bearer wrong-secret", "Bearer phoné-secre"])("rejects invalid authorization: %s", async (authorization) => {
    const socket = connect("/agent/audio?uuid=call-1&sessionId=session-1", authorization);
    const [error] = await once(socket, "error");
    expect(error.message).toContain("401");
    expect(manager.attach).not.toHaveBeenCalled();
  });
  it("rejects expired or already consumed reservations", async () => {
    manager.hasReservation.mockReturnValue(false);
    const socket = connect("/agent/audio?uuid=call-1&sessionId=stale", "Bearer phone-secret");
    const [error] = await once(socket, "error");
    expect(error.message).toContain("401");
    expect(manager.attach).not.toHaveBeenCalled();
  });
  it("requires the session identity", async () => {
    const socket = connect("/agent/audio?uuid=call-1", "Bearer phone-secret");
    const [error] = await once(socket, "error");
    expect(error.message).toContain("401");
  });
  it("closes a duplicate attachment rejected by the manager", async () => {
    manager.attach.mockImplementation(async (_uuid, _sessionId, phone: WebSocket) => {
      phone.close(1008, "Agent session unavailable");
      return false;
    });
    const socket = connect("/agent/audio?uuid=call-1&sessionId=session-1", "Bearer phone-secret");
    const [code] = await once(socket, "close");
    expect(code).toBe(1008);
  });
});
