import { beforeEach, describe, expect, it, vi } from "vitest";
import { voiceClient } from "../src/clients.js";
import { playlistService, type PlaylistTrack } from "../src/playlist.service.js";
import { routes } from "../src/routes.js";

vi.mock("../src/clients.js", () => ({
  vonageApiSecret: "test-secret",
  voiceClient: {
    playDTMF: vi.fn(),
    subscribeDTMF: vi.fn(),
    transferCallWithNCCO: vi.fn(),
  },
}));

vi.mock("../src/playlist.service.js", () => ({
  playlistService: {
    commitTrack: vi.fn(),
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
};

const workoutTrack: PlaylistTrack = {
  filePath: "workout-0.mp3",
  fileSize: 400,
  index: 0,
  playlistNumber: "22",
  playlistName: "Workout",
};

beforeEach(() => {
  vi.mocked(voiceClient.playDTMF).mockReset();
  vi.mocked(voiceClient.subscribeDTMF).mockReset();
  vi.mocked(voiceClient.transferCallWithNCCO).mockReset();
  vi.mocked(voiceClient.transferCallWithNCCO).mockResolvedValue({});

  vi.mocked(playlistService.commitTrack).mockReset();
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
  vi.mocked(playlistService.startPlaylistSelection).mockResolvedValue();
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
        text: "Press any number followed by the pound sign.",
      },
      {
        action: "input",
        type: ["dtmf"],
        dtmf: {
          maxDigits: 20,
          submitOnHash: true,
          timeOut: 10,
        },
        eventUrl: [
          "https://radio.example.test/input/playlist?uuid=call-1",
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
            "https://radio.example.test/track/22/0?secret=test-secret",
          ],
        }),
      ]),
    );
    expect(playlistService.commitTrack).toHaveBeenCalledWith(
      "call-1",
      "22",
      0,
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
  it("switches to a valid playlist number and returns playback NCCO", async () => {
    vi.mocked(playlistService.switchPlaylistByNumber).mockResolvedValue(
      workoutTrack,
    );

    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "22" } },
      query: { uuid: "call-1" },
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
            "https://radio.example.test/track/22/0?secret=test-secret",
          ],
        }),
      ]),
    );
  });

  it("returns to current playback when playlist input is invalid", async () => {
    vi.mocked(playlistService.switchPlaylistByNumber).mockResolvedValue(null);
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(defaultTrack);

    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "99" } },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(playlistService.resumePlayback).toHaveBeenCalledWith("call-1");
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "talk",
          text: "Playlist not found.",
        }),
        expect.objectContaining({
          action: "stream",
          streamUrl: [
            "https://radio.example.test/track/1/2?secret=test-secret",
          ],
        }),
      ]),
    );
  });

  it("resumes playback before returning 404 when invalid input has no current track", async () => {
    vi.mocked(playlistService.switchPlaylistByNumber).mockResolvedValue(null);
    vi.mocked(playlistService.getCurrentTrack).mockResolvedValue(null);

    const response = await invokeRoute("/input/playlist", {
      body: { dtmf: { digits: "99" } },
      query: { uuid: "call-1" },
    });

    expect(response.statusCode).toBe(404);
    expect(playlistService.resumePlayback).toHaveBeenCalledWith("call-1");
    expect(response.body).toEqual({
      error: "Current track could not be found.",
    });
  });
});

describe("POST /track/finished/:uuid/:playlistNumber/:songIndex", () => {
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
    );
  });
});
