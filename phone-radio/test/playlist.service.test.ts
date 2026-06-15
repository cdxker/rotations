import { stat } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redisClient } from "../src/clients.js";
import { playlistService } from "../src/playlist.service.js";

const playlistFixtures = vi.hoisted(() => ({
  playlists: [
    {
      number: "1",
      name: "Default",
      tracks: ["default-0.mp3", "default-1.mp3", "default-2.mp3"],
    },
    {
      number: "22",
      name: "Workout",
      tracks: ["workout-0.mp3", "workout-1.mp3"],
    },
  ],
}));
const redisPipeline = vi.hoisted(() => ({
  exec: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../src/clients.js", () => ({
  redisClient: {
    get: vi.fn(),
    pipeline: vi.fn(() => redisPipeline),
    set: vi.fn(),
  },
}));

vi.mock("../src/playlists/index.js", () => ({
  DEFAULT_PLAYLIST_NUMBER: "1",
  playlists: playlistFixtures.playlists,
}));

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(redisClient.get).mockReset();
  vi.mocked(redisClient.pipeline).mockClear();
  vi.mocked(redisClient.set).mockReset();
  vi.mocked(redisClient.set).mockResolvedValue("OK");
  redisPipeline.exec.mockReset();
  redisPipeline.exec.mockResolvedValue([]);
  redisPipeline.set.mockReset();
  redisPipeline.set.mockReturnValue(redisPipeline);
  vi.mocked(stat).mockReset();
  vi.mocked(stat).mockImplementation(async (filePath) => {
    const fileSizesByPath: Record<string, number> = {
      "default-0.mp3": 100,
      "default-1.mp3": 200,
      "default-2.mp3": 300,
      "workout-0.mp3": 400,
      "workout-1.mp3": 500,
    };
    const size = fileSizesByPath[String(filePath)];

    if (size === undefined) {
      throw new Error(`Missing mocked stat for ${String(filePath)}`);
    }

    return { size } as Awaited<ReturnType<typeof stat>>;
  });
});

function mockCurrentState({
  mode = "playing",
  playlistNumber = "1",
  trackIndex = "0",
}: {
  mode?: string | null;
  playlistNumber?: string | null;
  trackIndex?: string | null;
}) {
  vi.mocked(redisClient.get).mockImplementation(async (key) => {
    if (String(key).endsWith(":mode")) {
      return mode;
    }

    if (String(key).endsWith(":playlist")) {
      return playlistNumber;
    }

    if (String(key).endsWith(":track")) {
      return trackIndex;
    }

    return null;
  });
}

describe("startPlaylist", () => {
  it("stores the listener on the default playlist at the first track in one pipeline", async () => {
    await playlistService.startPlaylist("call-1");

    expect(redisClient.pipeline).toHaveBeenCalledTimes(1);
    expect(redisPipeline.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "1",
    );
    expect(redisPipeline.set).toHaveBeenCalledWith(
      "listener:call-1:track",
      "0",
    );
    expect(redisPipeline.set).toHaveBeenCalledWith(
      "listener:call-1:mode",
      "playing",
    );
    expect(redisPipeline.exec).toHaveBeenCalledTimes(1);
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("overwrites without reading the previous listener state", async () => {
    await playlistService.startPlaylist("call-1");

    expect(redisClient.get).not.toHaveBeenCalled();
  });
});

describe("playlist selection mode", () => {
  it("marks a listener as selecting a playlist", async () => {
    await playlistService.startPlaylistSelection("call-1");

    expect(redisClient.set).toHaveBeenCalledWith(
      "listener:call-1:mode",
      "selecting-playlist",
    );
  });

  it("marks a listener as playing again", async () => {
    await playlistService.resumePlayback("call-1");

    expect(redisClient.set).toHaveBeenCalledWith(
      "listener:call-1:mode",
      "playing",
    );
  });
});

describe("getCurrentTrack", () => {
  it("returns the current playlist track with file metadata", async () => {
    mockCurrentState({ playlistNumber: "22", trackIndex: "1" });

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toEqual({
      filePath: "workout-1.mp3",
      fileSize: 500,
      index: 1,
      playlistNumber: "22",
      playlistName: "Workout",
    });
    expect(stat).toHaveBeenCalledWith("workout-1.mp3");
  });

  it("defaults old listener state to the default playlist when no playlist key exists", async () => {
    mockCurrentState({ playlistNumber: null, trackIndex: "2" });

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toEqual({
      filePath: "default-2.mp3",
      fileSize: 300,
      index: 2,
      playlistNumber: "1",
      playlistName: "Default",
    });
  });

  it("returns null when Redis has no index for the listener", async () => {
    mockCurrentState({ trackIndex: null });

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
    expect(stat).not.toHaveBeenCalled();
  });

  it("returns null when the stored playlist number is invalid", async () => {
    mockCurrentState({ playlistNumber: "missing", trackIndex: "1" });

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
  });

  it("returns null when the stored index is invalid", async () => {
    mockCurrentState({ trackIndex: "not-a-number" });

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
  });

  it("returns null when the stored index is outside the active playlist", async () => {
    mockCurrentState({ playlistNumber: "22", trackIndex: "99" });

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toBeNull();
  });
});

describe("getTrackPath", () => {
  it("returns a requested track by playlist number and index", async () => {
    await expect(playlistService.getTrackPath("22", 1)).resolves.toEqual({
      filePath: "workout-1.mp3",
      fileSize: 500,
    });
    expect(stat).toHaveBeenCalledWith("workout-1.mp3");
  });

  it("returns null when the playlist number is unknown", async () => {
    await expect(playlistService.getTrackPath("missing", 0)).resolves.toBeNull();
  });

  it("returns null when the index is outside the playlist", async () => {
    await expect(playlistService.getTrackPath("22", 3)).resolves.toBeNull();
  });
});

describe("trackFinished", () => {
  it("advances within the active playlist when the callback matches Redis", async () => {
    mockCurrentState({ playlistNumber: "22", trackIndex: "0" });

    await expect(
      playlistService.trackFinished("call-1", "22", 0),
    ).resolves.toEqual({
      filePath: "workout-1.mp3",
      fileSize: 500,
      index: 1,
      playlistNumber: "22",
      playlistName: "Workout",
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "22",
    );
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", "1");
  });

  it("wraps to the first track after the last active playlist track finishes", async () => {
    mockCurrentState({ playlistNumber: "22", trackIndex: "1" });

    await expect(
      playlistService.trackFinished("call-1", "22", 1),
    ).resolves.toMatchObject({
      filePath: "workout-0.mp3",
      index: 0,
      playlistNumber: "22",
    });
  });

  it("ignores stale finished callbacks from a previous playlist", async () => {
    mockCurrentState({ playlistNumber: "22", trackIndex: "0" });

    await expect(
      playlistService.trackFinished("call-1", "1", 0),
    ).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("ignores finished callbacks while the listener is selecting a playlist", async () => {
    mockCurrentState({
      mode: "selecting-playlist",
      playlistNumber: "22",
      trackIndex: "0",
    });

    await expect(
      playlistService.trackFinished("call-1", "22", 0),
    ).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("ignores stale finished callbacks from a previous track index", async () => {
    mockCurrentState({ playlistNumber: "22", trackIndex: "1" });

    await expect(
      playlistService.trackFinished("call-1", "22", 0),
    ).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});

describe("next and previous track previews", () => {
  it("previews the next track without committing Redis state", async () => {
    mockCurrentState({ playlistNumber: "1", trackIndex: "0" });

    await expect(playlistService.getNextTrack("call-1")).resolves.toMatchObject(
      {
        filePath: "default-1.mp3",
        index: 1,
        playlistNumber: "1",
      },
    );
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("previews the previous track without committing Redis state", async () => {
    mockCurrentState({ playlistNumber: "1", trackIndex: "0" });

    await expect(
      playlistService.getPreviousTrack("call-1"),
    ).resolves.toMatchObject({
      filePath: "default-2.mp3",
      index: 2,
      playlistNumber: "1",
    });
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("keeps the next-track wrapper for non-transfer callers", async () => {
    mockCurrentState({ playlistNumber: "1", trackIndex: "0" });

    await expect(playlistService.toNextTrack("call-1")).resolves.toMatchObject({
      filePath: "default-1.mp3",
      index: 1,
      playlistNumber: "1",
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "1",
    );
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", "1");
  });

  it("keeps the previous-track wrapper for non-transfer callers", async () => {
    mockCurrentState({ playlistNumber: "1", trackIndex: "0" });

    await expect(
      playlistService.toPreviousTrack("call-1"),
    ).resolves.toMatchObject({
      filePath: "default-2.mp3",
      index: 2,
      playlistNumber: "1",
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "1",
    );
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", "2");
  });

  it("commits a validated target track", async () => {
    await expect(
      playlistService.commitTrack("call-1", "22", 1),
    ).resolves.toMatchObject({
      filePath: "workout-1.mp3",
      index: 1,
      playlistNumber: "22",
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "22",
    );
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", "1");
  });
});

describe("switchPlaylistByNumber", () => {
  it("switches to the selected playlist and starts at track zero", async () => {
    await expect(
      playlistService.switchPlaylistByNumber("call-1", "22#"),
    ).resolves.toEqual({
      filePath: "workout-0.mp3",
      fileSize: 400,
      index: 0,
      playlistNumber: "22",
      playlistName: "Workout",
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "22",
    );
    expect(redisClient.set).toHaveBeenCalledWith("listener:call-1:track", "0");
  });

  it("returns null and leaves Redis unchanged for an unknown playlist number", async () => {
    await expect(
      playlistService.switchPlaylistByNumber("call-1", "99"),
    ).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});
