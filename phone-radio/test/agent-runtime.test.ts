import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentBridgeManager } from "../src/agent/bridge-manager.js";
import { finishAgent, reserveAgent } from "../src/agent/runtime.js";
import { voiceClient } from "../src/clients.js";
import { agentConfig } from "../src/env.js";
import { playlistService } from "../src/playlist.service.js";

type ManagerOptions = ConstructorParameters<typeof AgentBridgeManager>[0];

const mocks = vi.hoisted(() => ({
  options: null as ManagerOptions | null,
  manager: { reserve: vi.fn(), release: vi.fn() },
  liveSession: vi.fn(),
}));

vi.mock("../src/agent/bridge-manager.js", () => ({
  AgentBridgeManager: class {
    constructor(options: ManagerOptions) {
      mocks.options = options;
      return mocks.manager;
    }
  },
}));

vi.mock("../src/agent/live-session.js", () => ({
  LiveSession: class {
    constructor(options: unknown) { mocks.liveSession(options); }
  },
}));

vi.mock("../src/clients.js", () => ({
  voiceClient: { transferCallWithNCCO: vi.fn() },
  vonageApiSecret: "vonage-test-secret",
}));

vi.mock("../src/env.js", () => ({
  agentConfig: {
    enabled: true,
    apiKey: "provider-api-secret",
    websocketSecret: "phone-socket-secret",
  },
}));

vi.mock("../src/playlist.service.js", () => ({
  playlistService: {
    claimPlaylistSelection: vi.fn(),
    getCurrentTrack: vi.fn(),
    resumePlayback: vi.fn(),
    transitionFromAgent: vi.fn(),
  },
}));

const url = "https://radio.example.test";

function options(): ManagerOptions {
  if (!mocks.options) throw new Error("Runtime did not configure the bridge manager.");
  return mocks.options;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  for (const [uuid, sessionId] of mocks.manager.reserve.mock.calls) {
    options().onClosed?.(uuid, sessionId);
  }
  vi.resetAllMocks();
  Object.assign(agentConfig, { enabled: true });
  mocks.manager.release.mockResolvedValue(undefined);
  vi.mocked(voiceClient.transferCallWithNCCO).mockResolvedValue({});
  vi.mocked(playlistService.transitionFromAgent).mockResolvedValue("selector-1");
  vi.mocked(playlistService.claimPlaylistSelection).mockResolvedValue(true);
  vi.mocked(playlistService.resumePlayback).mockResolvedValue();
  vi.mocked(playlistService.getCurrentTrack).mockResolvedValue({
    filePath: "saved.mp3",
    fileSize: 100,
    index: 3,
    playlistNumber: "22",
    playlistName: "Saved playlist",
  });
});

describe("agent runtime", () => {
  it("claims the exit before transport cleanup or transferring to a fresh menu", async () => {
    reserveAgent("call-1", "session-1", url);
    const transition = deferred<string | null>();
    const cleanup = deferred<void>();
    vi.mocked(playlistService.transitionFromAgent).mockReturnValue(transition.promise);
    mocks.manager.release.mockReturnValue(cleanup.promise);

    const leaving = options().onExit("call-1", "session-1");
    expect(playlistService.transitionFromAgent).toHaveBeenCalledWith("call-1", "session-1", "selecting-playlist");
    expect(mocks.manager.release).not.toHaveBeenCalled();
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();

    transition.resolve("new-menu");
    await leaving;

    expect(mocks.manager.release).toHaveBeenCalledWith("call-1", "session-1");
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledWith("call-1", expect.arrayContaining([
      expect.objectContaining({
        action: "input",
        eventUrl: [`${url}/input/playlist?uuid=call-1&selectorId=new-menu`],
      }),
    ]));
    expect(mocks.manager.release.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(voiceClient.transferCallWithNCCO).mock.invocationCallOrder[0],
    );
    expect(playlistService.resumePlayback).not.toHaveBeenCalled();
    cleanup.resolve();
  });

  it("does not transfer a stale agent exit over the caller's newer session", async () => {
    reserveAgent("call-1", "old-session", url);
    vi.mocked(playlistService.transitionFromAgent).mockResolvedValue(null);

    await options().onExit("call-1", "old-session");

    expect(mocks.manager.release).not.toHaveBeenCalled();
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();
  });

  it("recovers the saved playlist and track once after concurrent failure callbacks", async () => {
    reserveAgent("call-1", "session-1", url);
    vi.mocked(playlistService.transitionFromAgent)
      .mockResolvedValueOnce("session-1")
      .mockResolvedValue(null);

    await Promise.all([
      options().onFailure("call-1", "session-1", "provider-closed"),
      options().onFailure("call-1", "session-1", "phone-closed"),
    ]);

    expect(playlistService.getCurrentTrack).toHaveBeenCalledTimes(1);
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledExactlyOnceWith("call-1", expect.arrayContaining([
      { action: "talk", text: "The AI connection ended. Returning to music." },
      expect.objectContaining({
        action: "stream",
        streamUrl: [`${url}/track/22/3?secret=vonage-test-secret`],
      }),
    ]));
    expect(playlistService.resumePlayback).not.toHaveBeenCalled();
  });

  it.each([true, false])("recovers a failed menu transfer only when its selector is still current (%s)", async (current) => {
    reserveAgent("call-1", "session-1", url);
    vi.mocked(voiceClient.transferCallWithNCCO).mockRejectedValueOnce(new Error("transfer failed"));
    vi.mocked(playlistService.claimPlaylistSelection).mockResolvedValue(current);

    await options().onExit("call-1", "session-1");

    expect(playlistService.claimPlaylistSelection).toHaveBeenCalledExactlyOnceWith("call-1", "selector-1");
    expect(playlistService.resumePlayback).toHaveBeenCalledTimes(current ? 1 : 0);
    expect(playlistService.getCurrentTrack).toHaveBeenCalledTimes(current ? 1 : 0);
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledTimes(current ? 2 : 1);
    if (current) {
      expect(voiceClient.transferCallWithNCCO).toHaveBeenLastCalledWith("call-1", expect.arrayContaining([
        { action: "talk", text: "The menu is unavailable. Returning to music." },
        expect.objectContaining({ action: "stream", streamUrl: [`${url}/track/22/3?secret=vonage-test-secret`] }),
      ]));
    }
  });

  it("releases only the ended generation when a stale hangup follows a new reservation", async () => {
    reserveAgent("call-1", "old-session", url);
    reserveAgent("call-1", "new-session", "https://new-radio.example.test");
    vi.mocked(playlistService.transitionFromAgent).mockResolvedValueOnce(null);

    await expect(finishAgent("call-1", "old-session")).resolves.toBe(false);

    expect(mocks.manager.release).toHaveBeenCalledExactlyOnceWith("call-1", "old-session");
    expect(playlistService.getCurrentTrack).not.toHaveBeenCalled();
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();

    await options().onExit("call-1", "new-session");
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledWith("call-1", expect.arrayContaining([
      expect.objectContaining({
        action: "input",
        eventUrl: ["https://new-radio.example.test/input/playlist?uuid=call-1&selectorId=selector-1"],
      }),
    ]));
  });

  it("clears closed-session metadata while preserving another caller", async () => {
    reserveAgent("call-1", "session-1", url);
    reserveAgent("call-2", "session-2", "https://other.example.test");
    options().onClosed?.("call-1", "session-1");

    await options().onExit("call-1", "session-1");
    expect(playlistService.transitionFromAgent).not.toHaveBeenCalled();
    await options().onExit("call-2", "session-2");

    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledExactlyOnceWith("call-2", expect.arrayContaining([
      expect.objectContaining({
        action: "input",
        eventUrl: ["https://other.example.test/input/playlist?uuid=call-2&selectorId=selector-1"],
      }),
    ]));
  });

  it("erases metadata when reservation fails", async () => {
    mocks.manager.reserve.mockImplementationOnce(() => { throw new Error("closed"); });
    expect(() => reserveAgent("call-1", "session-1", url)).toThrow("closed");

    await options().onExit("call-1", "session-1");
    expect(playlistService.transitionFromAgent).not.toHaveBeenCalled();
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();
  });

  it("passes the provider credential only to the provider session", async () => {
    const callbacks = { onAudio: vi.fn(), onFailure: vi.fn() };
    options().createSession(callbacks);

    expect(mocks.liveSession).toHaveBeenCalledExactlyOnceWith({
      apiKey: "provider-api-secret",
      ...callbacks,
    });
    reserveAgent("call-1", "session-1", url);
    await options().onExit("call-1", "session-1");

    expect(mocks.manager.reserve).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
    const transfers = vi.mocked(voiceClient.transferCallWithNCCO).mock.calls;
    expect(JSON.stringify(transfers)).not.toContain("provider-api-secret");
    expect(JSON.stringify(transfers)).not.toContain("phone-socket-secret");
  });

  it("refuses provider sessions when AI is disabled", () => {
    Object.assign(agentConfig, { enabled: false });
    expect(() => options().createSession({ onAudio: vi.fn(), onFailure: vi.fn() })).toThrow("AI agent is unavailable.");
    expect(mocks.liveSession).not.toHaveBeenCalled();
  });
});
