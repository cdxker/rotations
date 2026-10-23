import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentBridgeManager } from "../src/agent/bridge-manager.js";
import { finishAgent, handleSongTransferDigit, reserveAgent } from "../src/agent/runtime.js";
import { voiceClient } from "../src/clients.js";
import { agentConfig } from "../src/env.js";
import { playlistService } from "../src/playlist.service.js";

type ManagerOptions = ConstructorParameters<typeof AgentBridgeManager>[0];

const mocks = vi.hoisted(() => ({
  options: null as ManagerOptions | null,
  manager: { reserve: vi.fn(), release: vi.fn() },
  liveSession: vi.fn(),
  playlistTools: vi.fn(),
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

vi.mock("../src/agent/playlist-tools.js", () => ({
  createPlaylistTools: (options: unknown) => { mocks.playlistTools(options); return { definitions: [], instructions: "song skill", execute: "test" }; },
}));

vi.mock("../src/clients.js", () => ({
  voiceClient: { transferCallWithNCCO: vi.fn() },
  vonageApiSecret: "vonage-test-secret",
}));

vi.mock("../src/env.js", () => ({
  discordDestinationRegistry: { getAll: () => [{ code: "50" }] },
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
    getAgentSessionId: vi.fn(),
    resumePlayback: vi.fn(),
    transitionFromAgent: vi.fn(),
    beginRequestedSong: vi.fn(),
    finishRequestedSong: vi.fn(),
    selectRequestedSong: vi.fn(),
    restoreRequestedSongAgent: vi.fn(),
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
    catalogRevision: "saved-revision",
  });
  vi.mocked(playlistService.beginRequestedSong).mockResolvedValue({ id: "request-1", filePath: "/music/request.mp3", fileSize: 100 });
  vi.mocked(playlistService.selectRequestedSong).mockResolvedValue("song-menu");
});

describe("agent runtime", () => {
  it("plays a requested song for its caller and releases Live only after transfer succeeds", async () => {
    reserveAgent("call-1", "session-1", url);
    options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() });
    const toolOptions = mocks.playlistTools.mock.calls[0][0];
    expect(toolOptions.reservedPlaylistNumbers).toEqual(["50"]);
    const transfer = deferred<any>();
    vi.mocked(voiceClient.transferCallWithNCCO).mockReturnValueOnce(transfer.promise);
    const signal = new AbortController().signal;
    const playing = toolOptions.playSong("/music/request.mp3", "Requested song", signal);
    await vi.waitFor(() => expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledOnce());
    expect(playlistService.beginRequestedSong).toHaveBeenCalledWith("call-1", "session-1", "/music/request.mp3", signal);
    expect(mocks.manager.release).not.toHaveBeenCalled();
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledWith("call-1", expect.arrayContaining([
      { action: "talk", text: "Playing Requested song." },
      expect.objectContaining({ action: "stream", streamUrl: [expect.stringContaining("/requested-song/call-1/request-1?secret=")] }),
    ]));
    transfer.resolve({});
    await playing;
    expect(mocks.manager.release).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
    expect(playlistService.finishRequestedSong).not.toHaveBeenCalled();
  });

  it("keeps a library song's playlist position for automatic continuation", async () => {
    reserveAgent("call-1", "session-1", url);
    options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() });
    const signal = new AbortController().signal;
    const position = { playlistNumber: "22", trackIndex: 4, catalogRevision: "revision-22" };

    await mocks.playlistTools.mock.calls[0][0].playSong(
      "/music/request.mp3",
      "Requested song",
      signal,
      position,
    );

    expect(playlistService.beginRequestedSong).toHaveBeenCalledWith(
      "call-1",
      "session-1",
      "/music/request.mp3",
      signal,
      position,
    );
  });

  it.each([true, false])("recovers a rejected song transfer only if its request still owns playback (%s)", async current => {
    reserveAgent("call-1", "session-1", url);
    options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() });
    vi.mocked(voiceClient.transferCallWithNCCO).mockRejectedValueOnce(new Error("provider failure"));
    vi.mocked(playlistService.restoreRequestedSongAgent).mockResolvedValue(current);
    await expect(mocks.playlistTools.mock.calls[0][0].playSong("/music/request.mp3", "Song", new AbortController().signal)).rejects.toThrow("could not be played");
    expect(playlistService.restoreRequestedSongAgent).toHaveBeenCalledExactlyOnceWith("call-1", "request-1", "session-1");
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledOnce();
    expect(mocks.manager.release).toHaveBeenCalledTimes(current ? 0 : 1);
  });

  it.each(["websocket", "http"])("honors %s digit nine during a song transfer after that transfer settles", async transport => {
    reserveAgent("call-1", "session-1", url);
    options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() });
    const transfer = deferred<any>();
    vi.mocked(voiceClient.transferCallWithNCCO).mockReturnValueOnce(transfer.promise);
    const controller = new AbortController();
    const playing = mocks.playlistTools.mock.calls[0][0].playSong("/music/request.mp3", "Song", controller.signal);
    await vi.waitFor(() => expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledOnce());
    controller.abort(); // Bridge shutdown cancels the Live tools before onExit.
    if (transport === "http") options().onClosed?.("call-1", "session-1");
    const leaving = transport === "websocket" ? options().onExit("call-1", "session-1") : handleSongTransferDigit("call-1", "9");
    expect(playlistService.selectRequestedSong).not.toHaveBeenCalled();
    transfer.resolve({});
    await Promise.all([playing, leaving]);
    expect(playlistService.selectRequestedSong).toHaveBeenCalledExactlyOnceWith("call-1", "request-1");
    expect(voiceClient.transferCallWithNCCO).toHaveBeenLastCalledWith("call-1", expect.arrayContaining([
      expect.objectContaining({ action: "input", eventUrl: [`${url}/input/playlist?uuid=call-1&selectorId=song-menu`] }),
    ]));
    expect(playlistService.finishRequestedSong).not.toHaveBeenCalled();
  });

  it("opens the menu when nine arrives during restoration after a rejected transfer", async () => {
    reserveAgent("call-1", "session-1", url);
    options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() });
    vi.mocked(voiceClient.transferCallWithNCCO).mockRejectedValueOnce(new Error("failed"));
    const restored = deferred<boolean>();
    vi.mocked(playlistService.restoreRequestedSongAgent).mockReturnValueOnce(restored.promise);
    const playing = mocks.playlistTools.mock.calls[0][0].playSong("/music/request.mp3", "Song", new AbortController().signal);
    const rejected = expect(playing).rejects.toThrow("could not be played");
    await vi.waitFor(() => expect(playlistService.restoreRequestedSongAgent).toHaveBeenCalledOnce());
    const leaving = handleSongTransferDigit("call-1", "9");
    restored.resolve(true);
    await Promise.all([rejected, leaving]);
    expect(playlistService.transitionFromAgent).toHaveBeenCalledExactlyOnceWith("call-1", "session-1", "selecting-playlist");
    expect(playlistService.selectRequestedSong).not.toHaveBeenCalled();
    expect(voiceClient.transferCallWithNCCO).toHaveBeenLastCalledWith("call-1", expect.arrayContaining([
      expect.objectContaining({ action: "input", eventUrl: [`${url}/input/playlist?uuid=call-1&selectorId=selector-1`] }),
    ]));
  });

  it("settles a rejected transfer before recovering a failed Live connection", async () => {
    reserveAgent("call-1", "session-1", url);
    options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() });
    let reject!: (error: Error) => void;
    vi.mocked(voiceClient.transferCallWithNCCO).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    vi.mocked(playlistService.restoreRequestedSongAgent).mockResolvedValue(true);
    const playing = mocks.playlistTools.mock.calls[0][0].playSong("/music/request.mp3", "Song", new AbortController().signal);
    const rejected = expect(playing).rejects.toThrow("could not be played");
    await vi.waitFor(() => expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledOnce());
    const failed = options().onFailure("call-1", "session-1", "provider closed");
    expect(playlistService.transitionFromAgent).not.toHaveBeenCalled();
    reject(new Error("transfer rejected"));
    await Promise.all([rejected, failed]);
    expect(playlistService.restoreRequestedSongAgent).toHaveBeenCalledExactlyOnceWith("call-1", "request-1", "session-1");
    expect(playlistService.transitionFromAgent).toHaveBeenCalledExactlyOnceWith("call-1", "session-1", "playing");
    expect(voiceClient.transferCallWithNCCO).toHaveBeenLastCalledWith("call-1", expect.arrayContaining([
      expect.objectContaining({ action: "stream", streamUrl: [`${url}/track/22/3?secret=vonage-test-secret&catalogRevision=saved-revision`] }),
    ]));
  });

  it("leaves stale or cancelled song requests alone", async () => {
    reserveAgent("call-1", "session-1", url);
    options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() });
    const playSong = mocks.playlistTools.mock.calls[0][0].playSong;
    vi.mocked(playlistService.beginRequestedSong).mockResolvedValue(null);
    await expect(playSong("/music/request.mp3", "Song", new AbortController().signal)).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(playSong("/music/request.mp3", "Song", controller.signal)).rejects.toThrow();
    expect(playlistService.beginRequestedSong).toHaveBeenCalledTimes(1);
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();
    expect(mocks.manager.release).not.toHaveBeenCalled();
  });

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
        streamUrl: [`${url}/track/22/3?secret=vonage-test-secret&catalogRevision=saved-revision`],
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
        expect.objectContaining({ action: "stream", streamUrl: [`${url}/track/22/3?secret=vonage-test-secret&catalogRevision=saved-revision`] }),
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
    const callbacks = { uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() };
    options().createSession(callbacks);

    expect(mocks.liveSession).toHaveBeenCalledExactlyOnceWith({
      apiKey: "provider-api-secret",
      onAudio: callbacks.onAudio,
      onFailure: callbacks.onFailure,
      tools: { definitions: [], instructions: "song skill", execute: "test" },
    });
    const toolOptions = mocks.playlistTools.mock.calls[0][0];
    await expect(toolOptions.currentPlaylist()).resolves.toBe("22");
    vi.mocked(playlistService.getAgentSessionId).mockResolvedValue("session-1");
    await expect(toolOptions.isActive()).resolves.toBe(true);
    vi.mocked(playlistService.getAgentSessionId).mockResolvedValue("new-session");
    await expect(toolOptions.isActive()).resolves.toBe(false);
    reserveAgent("call-1", "session-1", url);
    await options().onExit("call-1", "session-1");

    expect(mocks.manager.reserve).toHaveBeenCalledExactlyOnceWith("call-1", "session-1");
    const transfers = vi.mocked(voiceClient.transferCallWithNCCO).mock.calls;
    expect(JSON.stringify(transfers)).not.toContain("provider-api-secret");
    expect(JSON.stringify(transfers)).not.toContain("phone-socket-secret");
  });

  it("refuses provider sessions when AI is disabled", () => {
    Object.assign(agentConfig, { enabled: false });
    expect(() => options().createSession({ uuid: "call-1", sessionId: "session-1", onAudio: vi.fn(), onFailure: vi.fn() })).toThrow("AI agent is unavailable.");
    expect(mocks.liveSession).not.toHaveBeenCalled();
  });
});
