import { stat } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redisClient } from "../src/clients.js";
import { playlistService } from "../src/playlist.service.js";
import { tracks } from "../src/tracks.js";

vi.mock("../src/clients.js", () => ({
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("../src/tracks.js", () => ({
  tracks: ["track-0.mp3", "track-1.mp3", "track-2.mp3"],
}));

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(redisClient.get).mockReset();
  vi.mocked(redisClient.set).mockReset();
  vi.mocked(redisClient.set).mockResolvedValue("OK");
  vi.mocked(stat).mockReset();
  tracks.splice(
    0,
    tracks.length,
    "track-0.mp3",
    "track-1.mp3",
    "track-2.mp3",
  );
  vi.mocked(stat).mockImplementation(async (filePath) => {
    const fileSizesByPath: Record<string, number> = {
      "track-0.mp3": 100,
      "track-1.mp3": 200,
      "track-2.mp3": 300,
    };
    const size = fileSizesByPath[String(filePath)];

    if (size === undefined) {
      throw new Error(`Missing mocked stat for ${String(filePath)}`);
    }

    return { size } as Awaited<ReturnType<typeof stat>>;
  });
});

describe("startPlaylist", () => {
  it("stores the listener at the first track", async () => {
    await playlistService.startPlaylist("call-1");

    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", "0");
  });

  it("overwrites without reading the previous listener index", async () => {
    await playlistService.startPlaylist("call-1");

    expect(redisClient.get).not.toHaveBeenCalled();
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", "0");
  });
});

describe("getCurrentTrack", () => {
  it("returns the current track with file metadata", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("1");

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toEqual({
      filePath: "track-1.mp3",
      fileSize: 200,
      index: 1,
    });
    expect(redisClient.get).toHaveBeenCalledWith("listener:call-1:track");
    expect(stat).toHaveBeenCalledWith("track-1.mp3");
  });

  it("returns null when Redis has no index for the listener", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce(null);

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
    expect(stat).not.toHaveBeenCalled();
  });

  it("returns null when the stored index is invalid", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("not-a-number");

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
  });

  it("returns null when the stored index is outside the track list", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("99");

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
  });

  it("returns null when stat fails for the current track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("1");
    vi.mocked(stat).mockRejectedValueOnce(new Error("missing file"));

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
  });

  it("returns null when Redis get fails", async () => {
    vi.mocked(redisClient.get).mockRejectedValueOnce(
      new Error("redis unavailable"),
    );

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
  });
});

describe("getTrackPath", () => {
  it("returns the requested track with file metadata", async () => {
    await expect(playlistService.getTrackPath(2)).resolves.toEqual({
      filePath: "track-2.mp3",
      fileSize: 300,
    });
    expect(stat).toHaveBeenCalledWith("track-2.mp3");
  });

  it("returns null when the index is outside the track list", async () => {
    await expect(playlistService.getTrackPath(3)).resolves.toBeNull();
  });

  it("returns null when stat fails", async () => {
    vi.mocked(stat).mockRejectedValueOnce(new Error("missing file"));

    await expect(playlistService.getTrackPath(0)).resolves.toBeNull();
  });
});

describe("trackFinished", () => {
  it("advances to the next track when the completed index matches Redis", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("1");

    await expect(playlistService.trackFinished("call-1", 1)).resolves.toEqual({
      filePath: "track-2.mp3",
      fileSize: 300,
      index: 2,
    });
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", 2);
  });

  it("wraps to the first track after the last track finishes", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("2");

    await expect(playlistService.trackFinished("call-1", 2)).resolves.toEqual({
      filePath: "track-0.mp3",
      fileSize: 100,
      index: 0,
    });
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", 0);
  });

  it("returns null and leaves Redis unchanged when the completed index is stale", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("2");

    await expect(playlistService.trackFinished("call-1", 1)).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("returns null when there is no current track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce(null);

    await expect(playlistService.trackFinished("call-1", 0)).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("does not reread Redis after validating the completed track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("0");

    await playlistService.trackFinished("call-1", 0);

    expect(redisClient.get).toHaveBeenCalledTimes(1);
  });

  it("returns null and leaves Redis unchanged when the next track stat fails", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("0");
    vi.mocked(stat)
      .mockResolvedValueOnce({ size: 100 } as Awaited<ReturnType<typeof stat>>)
      .mockRejectedValueOnce(new Error("missing next file"));

    await expect(playlistService.trackFinished("call-1", 0)).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});

describe("toNextTrack", () => {
  it("advances from the current track to the next track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("0");

    await expect(playlistService.toNextTrack("call-1")).resolves.toEqual({
      filePath: "track-1.mp3",
      fileSize: 200,
      index: 1,
    });
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", 1);
  });

  it("wraps from the last track to the first track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("2");

    await expect(playlistService.toNextTrack("call-1")).resolves.toEqual({
      filePath: "track-0.mp3",
      fileSize: 100,
      index: 0,
    });
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", 0);
  });

  it("returns null when there is no current track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce(null);

    await expect(playlistService.toNextTrack("call-1")).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("returns null and leaves Redis unchanged when the next track stat fails", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("0");
    vi.mocked(stat)
      .mockResolvedValueOnce({ size: 100 } as Awaited<ReturnType<typeof stat>>)
      .mockRejectedValueOnce(new Error("missing next file"));

    await expect(playlistService.toNextTrack("call-1")).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});

describe("toPreviousTrack", () => {
  it("rewinds from the current track to the previous track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("2");

    await expect(playlistService.toPreviousTrack("call-1")).resolves.toEqual({
      filePath: "track-1.mp3",
      fileSize: 200,
      index: 1,
    });
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", 1);
  });

  it("wraps from the first track to the last track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("0");

    await expect(playlistService.toPreviousTrack("call-1")).resolves.toEqual({
      filePath: "track-2.mp3",
      fileSize: 300,
      index: 2,
    });
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", 2);
  });

  it("returns null when there is no current track", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce(null);

    await expect(playlistService.toPreviousTrack("call-1")).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("returns null and leaves Redis unchanged when the previous track stat fails", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("0");
    vi.mocked(stat)
      .mockResolvedValueOnce({ size: 100 } as Awaited<ReturnType<typeof stat>>)
      .mockRejectedValueOnce(new Error("missing previous file"));

    await expect(playlistService.toPreviousTrack("call-1")).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});
