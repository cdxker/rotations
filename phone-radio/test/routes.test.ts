import { beforeEach, describe, expect, it, vi } from "vitest";
import { discordBridgeManager, discordRuntime, voiceClient } from "../src/clients.js";
import { agentConfig, discordBridgeConfig, discordDestinationRegistry } from "../src/env.js";
import { finishAgent, reserveAgent } from "../src/agent/runtime.js";
import { playlistService, type PlaylistTrack } from "../src/playlist.service.js";
import { routes } from "../src/routes.js";

vi.mock("../src/clients.js", () => ({
  discordBridgeManager: {
    cancelReservation: vi.fn(),
    detach: vi.fn(),
    reserve: vi.fn(),
  },
  discordRuntime: {
    getDestinationMemberCount: vi.fn(),
    isDestinationAvailable: vi.fn(),
  },
  vonageApiSecret: "test-secret",
  voiceClient: {
    playDTMF: vi.fn(),
    subscribeDTMF: vi.fn(),
    transferCallWithNCCO: vi.fn(),
  },
}));

vi.mock("../src/agent/runtime.js", () => ({ finishAgent: vi.fn(), reserveAgent: vi.fn() }));

vi.mock("../src/env.js", () => ({
  agentConfig: { enabled: false, apiKey: "test", websocketSecret: "agent-secret" },
  discordBridgeConfig: {
    enabled: false,
    websocketSecret: "discord-websocket-secret",
  },
  discordDestinationRegistry: { getByCode: vi.fn() },
}));

vi.mock("../src/playlist.service.js", () => ({
  playlistService: {
    beginAgent: vi.fn(),
    claimPlaylistSelection: vi.fn(),
    commitTrack: vi.fn(),
    beginDiscordBridge: vi.fn(),
    getListenerMode: vi.fn(),
    returnToPlaybackIfDiscord: vi.fn(),
    getCurrentTrack: vi.fn(),
    getNextTrack: vi.fn(),
    getPreviousTrack: vi.fn(),
    getTrackPath: vi.fn(),
    resumePlayback: vi.fn(),
    startPlaylist: vi.fn(),
    startPlaylistSelection: vi.fn(),
    switchPlaylistByNumber: vi.fn(),
    trackFinished: vi.fn(),
  },
}));

const defaultTrack: PlaylistTrack = {
  filePath: "default-2.mp3",
  fileSize: 300,
  index: 2,
  playlistNumber: "1",
  playlistName: "Default",
  catalogRevision: "default-revision",
};

const workoutTrack: PlaylistTrack = {
  filePath: "workout-0.mp3",
  fileSize: 400,
  index: 0,
  playlistNumber: "22",
  playlistName: "Workout",
  catalogRevision: "workout-revision",
};

beforeEach(() => {
  Object.assign(agentConfig, { enabled: false });
  vi.mocked(finishAgent).mockReset().mockResolvedValue(true);
  vi.mocked(reserveAgent).mockReset();
  vi.mocked(playlistService.beginAgent).mockReset().mockResolvedValue();
  vi.mocked(playlistService.claimPlaylistSelection).mockReset().mockResolvedValue(true);
  vi.mocked(discordBridgeManager.cancelReservation).mockReset();
  vi.mocked(discordBridgeManager.detach).mockReset();
  vi.mocked(discordBridgeManager.reserve).mockReset();
  vi.mocked(discordDestinationRegistry.getByCode).mockReset();
  vi.mocked(discordRuntime.getDestinationMemberCount).mockReset();
  vi.mocked(discordRuntime.isDestinationAvailable).mockReset();
  vi.mocked(discordRuntime.getDestinationMemberCount).mockResolvedValue(0);
  Object.assign(discordBridgeConfig, {
    enabled: false,
    websocketSecret: "discord-websocket-secret",
  });
  vi.mocked(voiceClient.playDTMF).mockReset();
  vi.mocked(voiceClient.subscribeDTMF).mockReset();
  vi.mocked(voiceClient.transferCallWithNCCO).mockReset();
  vi.mocked(voiceClient.playDTMF).mockResolvedValue({});
  vi.mocked(voiceClient.subscribeDTMF).mockResolvedValue({});
  vi.mocked(voiceClient.transferCallWithNCCO).mockResolvedValue({});

  vi.mocked(playlistService.commitTrack).mockReset();
  vi.mocked(playlistService.beginDiscordBridge).mockReset();
  vi.mocked(playlistService.getListenerMode).mockReset();
  vi.mocked(playlistService.returnToPlaybackIfDiscord).mockReset();
  vi.mocked(playlistService.getCurrentTrack).mockReset();
  vi.mocked(playlistService.getNextTrack).mockReset();
  vi.mocked(playlistService.getPreviousTrack).mockReset();
  vi.mocked(playlistService.getTrackPath).mockReset();
  vi.mocked(playlistService.resumePlayback).mockReset();
  vi.mocked(playlistService.startPlaylist).mockReset();
  vi.mocked(playlistService.startPlaylistSelection).mockReset();
  vi.mocked(playlistService.switchPlaylistByNumber).mockReset();
  vi.mocked(playlistService.trackFinished).mockReset();
  vi.mocked(playlistService.resumePlayback).mockResolvedValue();
  vi.mocked(playlistService.getListenerMode).mockResolvedValue("playing");
  vi.mocked(playlistService.returnToPlaybackIfDiscord).mockResolvedValue(true);
  vi.mocked(playlistService.startPlaylistSelection).mockResolvedValue("selector-1");
});

type InvokeRouteOptions = {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
};

async function invokeRoute(routePath: string, options: InvokeRouteOptions = {}) {
  const layer = (routes as unknown as { stack: unknown[] }).stack.find(
    (stackLayer) =>
      (stackLayer as { route?: { path: string } }).route?.path === routePath,
  ) as
    | {
        route: {
          stack: {
            handle: (
              req: unknown,
              res: unknown,
              next: (error?: unknown) => void,
            ) => unknown;
          }[];
        };
      }
    | undefined;

  if (!layer) {
    throw new Error(`Route ${routePath} was not registered`);
  }

  const response = {
    body: undefined as unknown,
    statusCode: 200,
    setHeader: vi.fn(),
    sendFile: vi.fn(),
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload?: unknown) {
      this.body = payload;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
  const request = {
    body: options.body ?? {},
    locals: {
      baseUrl: "https://radio.example.test",
    },
    log: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    params: options.params ?? {},
    query: options.query ?? {},
  };

  await Promise.resolve(
    layer.route.stack[0].handle(request, response, (error?: unknown) => {
      if (error) {
        throw error;
      }
    }),
  );

  return response;
}

describe("POST /input/digit", () => {
  it("deduplicates simultaneous digit-9 playlist-selector transfers", async () => {
    let completeTransfer: (() => void) | undefined;
    vi.mocked(voiceClient.transferCallWithNCCO).mockImplementation(
      () =>
        new Promise((resolve) => {
          completeTransfer = resolve;
        }),
    );

    const first = invokeRoute("/input/digit", {
      body: { digit: "9" },
      query: { uuid: "call-1" },
    });
    await Promise.resolve();
    const second = await invokeRoute("/input/digit", {
      body: { digit: "9" },
      query: { uuid: "call-1" },
    });

    expect(second.statusCode).toBe(204);
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledTimes(1);
    completeTransfer?.();
    expect((await first).statusCode).toBe(204);
  });

  it("ignores music navigation but lets digit 9 leave Discord mode", async () => {
    vi.mocked(playlistService.getListenerMode).mockResolvedValue("discord");
    const skipped = await invokeRoute("/input/digit", {
      body: { digit: "1" },
      query: { uuid: "call-1" },
    });
    expect(skipped.statusCode).toBe(204);
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();

    const exited = await invokeRoute("/input/digit", {
      body: { digit: "9" },
      query: { uuid: "call-1" },
    });
    expect(exited.statusCode).toBe(204);
    expect(discordBridgeManager.detach).toHaveBeenCalledWith("call-1");
    expect(playlistService.startPlaylistSelection).toHaveBeenCalledWith("call-1");
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledTimes(1);
  });

  it("transfers digit 9 to the playlist selector NCCO", async () => {
    const response = await invokeRoute("/input/digit", {
      body: { digit: "9" },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(204);
    expect(playlistService.startPlaylistSelection).toHaveBeenCalledWith(
      "call-1",
    );
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledWith("call-1", [
      {
        action: "talk",
        text: "Enter a playlist number followed by pound, or enter 99 followed by pound to talk to our AI agent.",
      },
      {
        action: "input",
        type: ["dtmf"],
        dtmf: {
          maxDigits: 2,
          submitOnHash: true,
          timeOut: 10,
        },
        eventUrl: [
          "https://radio.example.test/input/playlist?uuid=call-1&selectorId=selector-1",
        ],
        eventMethod: "POST",
        mode: "synchronous",
      },
    ]);
  });

  it("resumes playback mode when playlist selector transfer fails", async () => {
    vi.mocked(voiceClient.transferCallWithNCCO).mockRejectedValue(
      new Error("vonage unavailable"),
    );

    const response = await invokeRoute("/input/digit", {
      body: { digit: "9" },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(502);
    expect(playlistService.startPlaylistSelection).toHaveBeenCalledWith(
      "call-1",
    );
    expect(playlistService.resumePlayback).toHaveBeenCalledWith("call-1");
  });

  it("does not use digit 0 for playlist selection", async () => {
    const response = await invokeRoute("/input/digit", {
      body: { digit: "0" },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(400);
    expect(playlistService.startPlaylistSelection).not.toHaveBeenCalled();
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();
  });

  it("transfers skip targets before committing the Redis track state", async () => {
    vi.mocked(playlistService.getNextTrack).mockResolvedValue(workoutTrack);
    vi.mocked(playlistService.commitTrack).mockResolvedValue(workoutTrack);

    const response = await invokeRoute("/input/digit", {
      body: { digit: "2" },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(204);
    expect(voiceClient.transferCallWithNCCO).toHaveBeenCalledWith(
      "call-1",
      expect.arrayContaining([
        expect.objectContaining({ action: "input", mode: "asynchronous" }),
        expect.objectContaining({
          action: "stream",
          streamUrl: [
            "https://radio.example.test/track/22/0?secret=test-secret&catalogRevision=workout-revision",
          ],
        }),
      ]),
    );
    expect(playlistService.commitTrack).toHaveBeenCalledWith(
      "call-1",
      "22",
      0,
      "workout-revision",
    );
    expect(
      vi.mocked(voiceClient.transferCallWithNCCO).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(playlistService.commitTrack).mock.invocationCallOrder[0],
    );
  });

  it("does not commit Redis state when a skip transfer fails", async () => {
    vi.mocked(playlistService.getPreviousTrack).mockResolvedValue(defaultTrack);
    vi.mocked(voiceClient.transferCallWithNCCO).mockRejectedValue(
      new Error("vonage unavailable"),
    );

    const response = await invokeRoute("/input/digit", {
      body: { digit: "1" },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(502);
    expect(playlistService.commitTrack).not.toHaveBeenCalled();
  });
});

describe("POST /input/playlist", () => {
  it("connects code 99 to a private AI session before checking destinations", async () => {
    Object.assign(agentConfig, { enabled: true });
    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "99" } }, query: { uuid: "call-1", selectorId: "selector-1" },
    });
    const sessionId = vi.mocked(playlistService.beginAgent).mock.calls[0][1];
    expect(reserveAgent).toHaveBeenCalledWith("call-1", sessionId, "https://radio.example.test");
    expect(discordDestinationRegistry.getByCode).not.toHaveBeenCalled();
    expect(playlistService.switchPlaylistByNumber).not.toHaveBeenCalled();
    expect(response.body).toEqual([
      expect.objectContaining({ action: "talk", text: expect.stringContaining("live AI agent") }),
      expect.objectContaining({
        action: "connect", eventType: "synchronous",
        eventUrl: [`https://radio.example.test/agent/event?uuid=call-1&sessionId=${sessionId}`],
        endpoint: [{ type: "websocket", uri: `wss://radio.example.test/agent/audio?uuid=call-1&sessionId=${sessionId}`,
          "content-type": "audio/l16;rate=16000", authorization: { type: "custom", value: "Bearer agent-secret" } }],
      }),
    ]);
  });

  it("keeps code 9 available as a playlist", async () => {
    vi.mocked(playlistService.switchPlaylistByNumber).mockResolvedValue(defaultTrack);
    await invokeRoute("/input/playlist", {
      body: { digits: "9" }, query: { uuid: "call-1", selectorId: "selector-1" },
    });
    expect(playlistService.switchPlaylistByNumber).toHaveBeenCalledWith("call-1", "9");
    expect(reserveAgent).not.toHaveBeenCalled();
  });

  it("returns to saved music when AI is disabled", async () => {
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);
    const response = await invokeRoute("/input/playlist", {
      body: { digits: "99" }, query: { uuid: "call-1", selectorId: "selector-1" },
    });
    expect(playlistService.resumePlayback).toHaveBeenCalledWith("call-1");
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "talk", text: "The AI agent is unavailable. Returning to music." }),
      expect.objectContaining({ action: "stream" }),
    ]));
    expect(reserveAgent).not.toHaveBeenCalled();
  });

  it("recovers when AI reservation fails", async () => {
    Object.assign(agentConfig, { enabled: true });
    vi.mocked(reserveAgent).mockImplementation(() => { throw new Error("busy"); });
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);
    const response = await invokeRoute("/input/playlist", {
      body: { digits: "99" }, query: { uuid: "call-1", selectorId: "selector-1" },
    });
    expect(finishAgent).toHaveBeenCalledWith("call-1", expect.any(String));
    expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ action: "stream" })]));
  });

  it.each([undefined, "stale-selector"])("ignores missing or stale selector IDs: %s", async (selectorId) => {
    vi.mocked(playlistService.claimPlaylistSelection).mockResolvedValue(false);
    const response = await invokeRoute("/input/playlist", {
      body: { digits: "99" }, query: { uuid: "call-1", ...(selectorId ? { selectorId } : {}) },
    });
    expect(response.statusCode).toBe(204);
    expect(playlistService.beginAgent).not.toHaveBeenCalled();
    expect(playlistService.switchPlaylistByNumber).not.toHaveBeenCalled();
  });

  it("returns an empty selection to music without speaking undefined", async () => {
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);
    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "" } }, query: { uuid: "call-1", selectorId: "selector-1" },
    });
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "talk", text: "Returning to music." }),
    ]));
  });
  it("returns a custom-authorized WebSocket NCCO for an available Discord destination", async () => {
    vi.mocked(discordDestinationRegistry.getByCode).mockReturnValue({
      channelId: "channel-1",
      code: "33",
      guildId: "guild-1",
      name: "Voice Chat 33",
    });
    vi.mocked(discordRuntime.isDestinationAvailable).mockReturnValue(true);
    vi.mocked(discordRuntime.getDestinationMemberCount).mockResolvedValue(2);
    Object.assign(discordBridgeConfig as object, {
      enabled: true,
      websocketSecret: "discord-websocket-secret",
    });
    vi.mocked(playlistService.beginDiscordBridge).mockResolvedValue();

    const response = await invokeRoute("/input/playlist", {
      body: { digits: "33" },
      query: { uuid: "call-1", selectorId: "selector-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(discordRuntime.getDestinationMemberCount).toHaveBeenCalledWith(
      expect.objectContaining({ code: "33" }),
    );
    expect(playlistService.beginDiscordBridge).toHaveBeenCalledWith("call-1", "33");
    expect(discordBridgeManager.reserve).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({ code: "33" }),
    );
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "talk",
        text: "There are 2 members in Voice Chat 33. Connecting now.",
      }),
      expect.objectContaining({ action: "connect", endpoint: [expect.objectContaining({
        authorization: { type: "custom", value: "Bearer discord-websocket-secret" },
      })] }),
    ]));
  });

  it("falls back to the current music track when a configured destination is unavailable", async () => {
    vi.mocked(discordDestinationRegistry.getByCode).mockReturnValue({
      channelId: "channel-1",
      code: "98",
      guildId: "guild-1",
      name: "Radio friends",
    });
    Object.assign(discordBridgeConfig as object, {
      enabled: true,
      websocketSecret: "discord-websocket-secret",
    });
    vi.mocked(discordRuntime.isDestinationAvailable).mockReturnValue(false);
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);

    const response = await invokeRoute("/input/playlist", {
      body: { digits: "98" },
      query: { uuid: "call-1", selectorId: "selector-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(playlistService.beginDiscordBridge).not.toHaveBeenCalled();
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "talk", text: "Discord Radio friends is unavailable." }),
    ]));
  });

  it("switches to a valid playlist number and returns playback NCCO", async () => {
    vi.mocked(playlistService.switchPlaylistByNumber).mockResolvedValue(
      workoutTrack,
    );

    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "22" } },
      query: { uuid: "call-1", selectorId: "selector-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(playlistService.switchPlaylistByNumber).toHaveBeenCalledWith(
      "call-1",
      "22",
    );
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "talk",
          text: "Playlist Workout.",
        }),
        expect.objectContaining({
          action: "stream",
          streamUrl: [
            "https://radio.example.test/track/22/0?secret=test-secret&catalogRevision=workout-revision",
          ],
        }),
      ]),
    );
  });

  it("returns to current playback when playlist input is invalid", async () => {
    vi.mocked(playlistService.switchPlaylistByNumber).mockResolvedValue(null);
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);

    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "98" } },
      query: { uuid: "call-1", selectorId: "selector-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(playlistService.resumePlayback).toHaveBeenCalledWith("call-1");
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "talk",
          text: "Playlist 98 not found.",
        }),
        expect.objectContaining({
          action: "stream",
          streamUrl: [
            "https://radio.example.test/track/1/2?secret=test-secret&catalogRevision=default-revision",
          ],
        }),
      ]),
    );
  });

  it("resumes playback before returning 404 when invalid input has no current track", async () => {
    vi.mocked(playlistService.switchPlaylistByNumber).mockResolvedValue(null);
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(null);

    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "98" } },
      query: { uuid: "call-1", selectorId: "selector-1" },
    });

    expect(response.statusCode).toBe(404);
    expect(playlistService.resumePlayback).toHaveBeenCalledWith("call-1");
    expect(response.body).toEqual({
      error: "Current track could not be found.",
    });
  });
});

describe("POST /discord/event", () => {
  it("returns the saved music NCCO after a failed bridge connection", async () => {
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);
    const response = await invokeRoute("/discord/event", {
      body: { status: "failed" },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(discordBridgeManager.cancelReservation).toHaveBeenCalledWith("call-1");
    expect(discordBridgeManager.detach).toHaveBeenCalledWith("call-1");
    expect(playlistService.returnToPlaybackIfDiscord).toHaveBeenCalledWith("call-1");
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "talk", text: "Discord connection ended. Returning to music." }),
    ]));
  });
});

describe("POST /track/finished/:uuid/:playlistNumber/:songIndex", () => {
  it("carries the immutable revision through completion and the next queued audio", async () => {
    vi.mocked(playlistService.trackFinished).mockResolvedValue(workoutTrack);
    const response = await invokeRoute("/track/finished/:uuid/:playlistNumber/:songIndex", {
      params: { playlistNumber: "22", songIndex: "1", uuid: "call-1" },
      query: { catalogRevision: "previous-revision" },
    });

    expect(playlistService.trackFinished).toHaveBeenCalledWith("call-1", "22", 1, "previous-revision");
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "stream", streamUrl: [
        "https://radio.example.test/track/22/0?secret=test-secret&catalogRevision=workout-revision",
      ] }),
      expect.objectContaining({ action: "notify", eventUrl: [
        "https://radio.example.test/track/finished/call-1/22/0?catalogRevision=workout-revision",
      ] }),
    ]));
  });

  it("passes playlist number through to stale callback protection", async () => {
    vi.mocked(playlistService.trackFinished).mockResolvedValue(null);

    const response = await invokeRoute(
      "/track/finished/:uuid/:playlistNumber/:songIndex",
      {
        params: {
          playlistNumber: "1",
          songIndex: "2",
          uuid: "call-1",
        },
      },
    );

    expect(response.statusCode).toBe(204);
    expect(playlistService.trackFinished).toHaveBeenCalledWith(
      "call-1",
      "1",
      2,
      undefined,
    );
  });
});

describe("GET /track/:playlistNumber/:index", () => {
  it("loads the original queued revision instead of resolving the current numeric index", async () => {
    vi.mocked(playlistService.getTrackPath).mockResolvedValue(defaultTrack);
    const response = await invokeRoute("/track/:playlistNumber/:index", {
      params: { playlistNumber: "1", index: "2" },
      query: { catalogRevision: "old-revision" },
    });

    expect(playlistService.getTrackPath).toHaveBeenCalledWith("1", 2, "old-revision");
    expect(response.sendFile).toHaveBeenCalledWith("default-2.mp3");
  });
});

describe("AI callback isolation", () => {
  it.each(["agent", "selecting-playlist"] as const)("ignores individual menu digits in %s mode", async (mode) => {
    vi.mocked(playlistService.getListenerMode).mockResolvedValue(mode);
    for (const digit of ["9", "9", "#", "1", "2"]) {
      expect((await invokeRoute("/input/digit", { body: { digit }, query: { uuid: "call-1" } })).statusCode).toBe(204);
    }
    expect(voiceClient.transferCallWithNCCO).not.toHaveBeenCalled();
    expect(playlistService.startPlaylistSelection).not.toHaveBeenCalled();
  });

  it("returns failed AI connections to saved music", async () => {
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);
    const response = await invokeRoute("/agent/event", {
      body: { status: "disconnected" }, query: { uuid: "call-1", sessionId: "agent-1" },
    });
    expect(finishAgent).toHaveBeenCalledWith("call-1", "agent-1");
    expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ action: "stream" })]));
  });

  it("ignores an old AI connection event after leaving the agent", async () => {
    vi.mocked(finishAgent).mockResolvedValue(false);
    const response = await invokeRoute("/agent/event", {
      body: { status: "failed" }, query: { uuid: "call-1", sessionId: "old-agent" },
    });
    expect(response.body).toEqual([]);
    expect(playlistService.getCurrentTrack).not.toHaveBeenCalled();
  });

  it("cleans completed calls without trying to restart music", async () => {
    const response = await invokeRoute("/agent/event", {
      body: { status: "completed" }, query: { uuid: "call-1", sessionId: "agent-1" },
    });
    expect(finishAgent).toHaveBeenCalledWith("call-1", "agent-1");
    expect(response.body).toEqual([]);
    expect(playlistService.getCurrentTrack).not.toHaveBeenCalled();
  });
});
