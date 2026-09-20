import { mkdtemp, rm, stat } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { redisClient } from "../src/clients.js";
import { playlistService } from "../src/playlist.service.js";
import type { PlaylistRevision } from "../src/playlists/catalog.js";

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
const catalogState = vi.hoisted(() => ({
  current: new Map<string, PlaylistRevision>(),
  revisions: new Map<string, PlaylistRevision>(),
}));

vi.mock("../src/playlists/catalog.js", () => ({
  playlistCatalog: {
    current: (number: string) => catalogState.current.get(number) ?? null,
    revision: (number: string, revision: string) => catalogState.revisions.get(`${number}:${revision}`) ?? null,
  },
}));

function publishRevision(number: string, paths: string[], revision: string): PlaylistRevision {
  const fixture = playlistFixtures.playlists.find((playlist) => playlist.number === number)!;
  const snapshot = Object.freeze({
    number,
    name: fixture.name,
    revision,
    tracks: Object.freeze([...paths]),
    songIds: Object.freeze(paths.map((path) => `${number}:${path}`)),
  });
  catalogState.current.set(number, snapshot);
  catalogState.revisions.set(`${number}:${revision}`, snapshot);
  return snapshot;
}

const redisTransaction = vi.hoisted(() => ({
  del: vi.fn(),
  exec: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../src/clients.js", () => ({
  redisClient: {
    get: vi.fn(),
    mget: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
    multi: vi.fn(() => redisTransaction),
    set: vi.fn(),
  },
}));

vi.mock("../src/playlists/index.js", () => ({
  DEFAULT_PLAYLIST_NUMBER: "1",
  playlists: playlistFixtures.playlists,
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  stat: vi.fn(),
}));

beforeEach(() => {
  catalogState.current.clear();
  catalogState.revisions.clear();
  for (const playlist of playlistFixtures.playlists) {
    publishRevision(playlist.number, playlist.tracks, `revision-${playlist.number}-initial`);
  }
  vi.mocked(redisClient.get).mockReset();
  vi.mocked(redisClient.mget).mockReset();
  vi.mocked(redisClient.del).mockReset();
  vi.mocked(redisClient.eval).mockReset();
  vi.mocked(redisClient.multi).mockReset();
  vi.mocked(redisClient.multi).mockReturnValue(
    redisTransaction as unknown as ReturnType<typeof redisClient.multi>,
  );
  vi.mocked(redisClient.set).mockReset();
  vi.mocked(redisClient.set).mockResolvedValue("OK");
  redisTransaction.exec.mockReset();
  redisTransaction.exec.mockResolvedValue([]);
  redisTransaction.set.mockReset();
  redisTransaction.set.mockReturnValue(redisTransaction);
  redisTransaction.del.mockReset();
  redisTransaction.del.mockReturnValue(redisTransaction);
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
  catalogRevision = null,
}: {
  mode?: string | null;
  playlistNumber?: string | null;
  trackIndex?: string | null;
  catalogRevision?: string | null;
}) {
  vi.mocked(redisClient.mget).mockResolvedValue([playlistNumber, trackIndex, catalogRevision]);
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
  it("stores the listener on the default playlist at the first track in one transaction", async () => {
    await playlistService.startPlaylist("call-1");

    expect(redisClient.multi).toHaveBeenCalledTimes(1);
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "1",
    );
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:track",
      "0",
    );
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:mode",
      "playing",
    );
    expect(redisTransaction.del).toHaveBeenCalledWith(
      "listener:call-1:discord-destination",
    );
    expect(redisTransaction.exec).toHaveBeenCalledTimes(1);
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("overwrites without reading the previous listener state", async () => {
    await playlistService.startPlaylist("call-1");

    expect(redisClient.get).not.toHaveBeenCalled();
    expect(redisClient.mget).not.toHaveBeenCalled();
  });
});

describe("state transactions", () => {
  const transitions = [
    { name: "new playlist", run: () => playlistService.startPlaylist("call-1") },
    { name: "menu", run: () => playlistService.startPlaylistSelection("call-1") },
    { name: "playback", run: () => playlistService.resumePlayback("call-1") },
    { name: "agent", run: () => playlistService.beginAgent("call-1", "session-1") },
    { name: "Discord", run: () => playlistService.beginDiscordBridge("call-1", "80") },
  ];

  it.each(transitions)("commits $name mode and its identifiers in one transaction", async ({ run }) => {
    await run();

    expect(redisClient.multi).toHaveBeenCalledExactlyOnceWith();
    expect(redisTransaction.exec).toHaveBeenCalledExactlyOnceWith();
    expect(redisClient.set).not.toHaveBeenCalled();
    expect(redisClient.del).not.toHaveBeenCalled();
  });

  it.each(transitions)("propagates a command failure when changing to $name mode", async ({ run }) => {
    const failure = new Error("Redis refused the state write");
    redisTransaction.exec.mockResolvedValue([[null, "OK"], [failure, null]]);

    await expect(run()).rejects.toBe(failure);
  });

  it("does not return a selector token when its transaction is aborted", async () => {
    redisTransaction.exec.mockResolvedValue(null);

    await expect(playlistService.startPlaylistSelection("call-1")).rejects.toThrow("transaction was aborted");
  });

  it("does not report a saved track as committed when its transaction fails", async () => {
    redisTransaction.exec.mockResolvedValue([[new Error("Redis write failed"), null]]);

    await expect(playlistService.commitTrack("call-1", "22", 1)).resolves.toBeNull();
    expect(redisClient.multi).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("playlist selection mode", () => {
  it("marks a listener as selecting a playlist with a unique callback token", async () => {
    const selectorId = await playlistService.startPlaylistSelection("call-1");

    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:mode",
      "selecting-playlist",
    );
    expect(redisTransaction.del).toHaveBeenCalledWith(
      "listener:call-1:discord-destination",
    );
    expect(selectorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:selector-id",
      selectorId,
    );
    expect(redisTransaction.del).toHaveBeenCalledWith(
      "listener:call-1:agent-session-id",
    );
    await expect(playlistService.startPlaylistSelection("call-1")).resolves.not.toBe(selectorId);
  });

  it("rejects selector callbacks without a token", async () => {
    await expect(playlistService.claimPlaylistSelection("call-1", "")).resolves.toBe(false);
    expect(redisClient.eval).not.toHaveBeenCalled();
  });

  it("marks a listener as playing again", async () => {
    await playlistService.resumePlayback("call-1");

    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:mode",
      "playing",
    );
    expect(redisTransaction.del).toHaveBeenCalledWith(
      "listener:call-1:discord-destination",
    );
  });
});

describe("Discord bridge listener state", () => {
  it("stores a selected Discord destination before setting Discord mode", async () => {
    await playlistService.beginDiscordBridge("call-1", "80");

    expect(redisTransaction.set).toHaveBeenNthCalledWith(
      1,
      "listener:call-1:discord-destination",
      "80",
    );
    expect(redisTransaction.set).toHaveBeenNthCalledWith(
      2,
      "listener:call-1:mode",
      "discord",
    );
    expect(redisTransaction.exec).toHaveBeenCalledTimes(1);
  });

  it("recognizes Discord mode and preserves the legacy playing default", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("discord");
    await expect(playlistService.getListenerMode("call-1")).resolves.toBe(
      "discord",
    );

    vi.mocked(redisClient.get).mockResolvedValueOnce(null);
    await expect(playlistService.getListenerMode("call-2")).resolves.toBe(
      "playing",
    );
  });

  it("reads the selected Discord destination code", async () => {
    vi.mocked(redisClient.get).mockResolvedValueOnce("80");

    await expect(
      playlistService.getDiscordDestinationCode("call-1"),
    ).resolves.toBe("80");
    expect(redisClient.get).toHaveBeenCalledWith(
      "listener:call-1:discord-destination",
    );
  });

  it("returns to music only when the listener is still in Discord mode", async () => {
    vi.mocked(redisClient.eval).mockResolvedValueOnce(1);
    await expect(
      playlistService.returnToPlaybackIfDiscord("call-1"),
    ).resolves.toBe(true);

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("DEL", KEYS[2])'),
      4,
      "listener:call-1:mode",
      "listener:call-1:discord-destination",
      "listener:call-1:selector-id",
      "listener:call-1:agent-session-id",
      "discord",
      "playing",
    );

    vi.mocked(redisClient.eval).mockResolvedValueOnce(0);
    await expect(
      playlistService.returnToPlaybackIfDiscord("call-1"),
    ).resolves.toBe(false);
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
      catalogRevision: "revision-22-initial",
    });
    expect(stat).toHaveBeenCalledWith("workout-1.mp3");
    expect(redisClient.mget).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "listener:call-1:track",
      "listener:call-1:catalog-revision",
    );
  });

  it("defaults old listener state to the default playlist when no playlist key exists", async () => {
    mockCurrentState({ playlistNumber: null, trackIndex: "2" });

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toEqual({
      filePath: "default-2.mp3",
      fileSize: 300,
      index: 2,
      playlistNumber: "1",
      playlistName: "Default",
      catalogRevision: "revision-1-initial",
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
    vi.mocked(redisClient.eval).mockResolvedValueOnce(1);

    await expect(
      playlistService.trackFinished("call-1", "22", 0),
    ).resolves.toEqual({
      filePath: "workout-1.mp3",
      fileSize: 500,
      index: 1,
      playlistNumber: "22",
      playlistName: "Workout",
      catalogRevision: "revision-22-initial",
    });
    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("GET", KEYS[3]) ~= ARGV[3]'),
      7,
      "listener:call-1:mode",
      "listener:call-1:playlist",
      "listener:call-1:track",
      "listener:call-1:discord-destination",
      "listener:call-1:selector-id",
      "listener:call-1:agent-session-id",
      "listener:call-1:catalog-revision",
      "playing",
      "22",
      "0",
      "1",
      "1",
      "",
      "revision-22-initial",
    );
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it("wraps to the first track after the last active playlist track finishes", async () => {
    mockCurrentState({ playlistNumber: "22", trackIndex: "1" });
    vi.mocked(redisClient.eval).mockResolvedValueOnce(1);

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

  it.each(["selecting-playlist", "agent", "discord"])("ignores finished callbacks while the listener is in %s mode", async (mode) => {
    mockCurrentState({
      mode,
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
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "1",
    );
    expect(redisTransaction.set).toHaveBeenCalledWith("listener:call-1:track", "1");
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
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "1",
    );
    expect(redisTransaction.set).toHaveBeenCalledWith("listener:call-1:track", "2");
  });

  it("commits a validated target track", async () => {
    await expect(
      playlistService.commitTrack("call-1", "22", 1),
    ).resolves.toMatchObject({
      filePath: "workout-1.mp3",
      index: 1,
      playlistNumber: "22",
    });
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "22",
    );
    expect(redisTransaction.set).toHaveBeenCalledWith("listener:call-1:track", "1");
    expect(redisClient.multi).toHaveBeenCalledExactlyOnceWith();
    expect(redisTransaction.exec).toHaveBeenCalledExactlyOnceWith();
    expect(redisClient.set).not.toHaveBeenCalled();
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
      catalogRevision: "revision-22-initial",
    });
    expect(redisTransaction.set).toHaveBeenCalledWith(
      "listener:call-1:playlist",
      "22",
    );
    expect(redisTransaction.set).toHaveBeenCalledWith("listener:call-1:track", "0");
  });

  it("returns null and leaves Redis unchanged for an unknown playlist number", async () => {
    await expect(
      playlistService.switchPlaylistByNumber("call-1", "99"),
    ).resolves.toBeNull();
    expect(redisClient.set).not.toHaveBeenCalled();
  });
});

describe("live playlist revisions", () => {
  it("keeps queued audio and the saved track on the original revision after a removal", async () => {
    mockCurrentState({ trackIndex: "1", catalogRevision: "revision-1-initial" });
    publishRevision("1", ["default-1.mp3", "default-2.mp3"], "edited");

    await expect(playlistService.getCurrentTrack("call-1")).resolves.toMatchObject({
      filePath: "default-1.mp3", index: 1, catalogRevision: "revision-1-initial",
    });
    await expect(playlistService.getTrackPath("1", 1, "revision-1-initial")).resolves.toMatchObject({
      filePath: "default-1.mp3",
    });
    await expect(playlistService.getNextTrack("call-1")).resolves.toMatchObject({
      filePath: "default-2.mp3", index: 1, catalogRevision: "edited",
    });
  });

  it("continues from the nearest surviving old neighbor when the playing song is removed", async () => {
    mockCurrentState({ trackIndex: "1", catalogRevision: "revision-1-initial" });
    publishRevision("1", ["default-0.mp3", "default-2.mp3"], "edited");

    await expect(playlistService.getNextTrack("call-1")).resolves.toMatchObject({
      filePath: "default-2.mp3", index: 1, catalogRevision: "edited",
    });
    await expect(playlistService.getPreviousTrack("call-1")).resolves.toMatchObject({
      filePath: "default-0.mp3", index: 0, catalogRevision: "edited",
    });
  });

  it("commits the exact preview after the catalog changes while a call transfer is pending", async () => {
    mockCurrentState({ catalogRevision: "revision-1-initial" });
    const preview = (await playlistService.getNextTrack("call-1"))!;
    publishRevision("1", ["default-0.mp3", "default-2.mp3"], "edited");

    await expect(playlistService.commitTrack("call-1", preview.playlistNumber, preview.index, preview.catalogRevision))
      .resolves.toMatchObject({ filePath: "default-1.mp3", catalogRevision: "revision-1-initial" });
    expect(redisTransaction.set).toHaveBeenCalledWith("listener:call-1:catalog-revision", "revision-1-initial");
  });

  it("rejects a callback with a missing or old revision even when its index matches", async () => {
    publishRevision("1", ["default-1.mp3", "default-2.mp3"], "edited");
    mockCurrentState({ catalogRevision: "edited" });

    await expect(playlistService.trackFinished("call-1", "1", 0, "revision-1-initial")).resolves.toBeNull();
    await expect(playlistService.trackFinished("call-1", "1", 0)).resolves.toBeNull();
    expect(redisClient.eval).not.toHaveBeenCalled();
  });

  it("never substitutes current audio for a missing immutable revision", async () => {
    await expect(playlistService.getTrackPath("1", 0, "unknown")).resolves.toBeNull();
    await expect(playlistService.commitTrack("call-1", "1", 0, "unknown")).resolves.toBeNull();
    expect(redisClient.multi).not.toHaveBeenCalled();
  });
});

// Exercise the actual Lua against an isolated Redis when the test host provides it.
// The existing mocked unit tests still run on machines without redis-server.
describe.skipIf(spawnSync("redis-server", ["--version"]).status !== 0)(
  "listener session guards with Redis",
  () => {
    let server: ChildProcess;
    let connection: Redis;
    let directory: string;

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), "phone-radio-sessions-"));
      const socketPath = join(directory, "redis.sock");
      server = spawn("redis-server", [
        "--port", "0",
        "--unixsocket", socketPath,
        "--save", "",
        "--appendonly", "no",
      ], { stdio: ["ignore", "pipe", "ignore"] });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Redis startup timed out")), 5_000);
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          error ? reject(error) : resolve();
        };
        server.once("error", finish);
        server.once("exit", (code) => finish(new Error(`Redis exited during startup: ${code}`)));
        server.stdout?.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("Ready to accept connections")) {
            finish();
          }
        });
      });
      connection = new Redis(socketPath, { lazyConnect: true });
      await connection.connect();
    });

    afterAll(async () => {
      connection?.disconnect();
      if (server && server.exitCode === null) {
        const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve()));
        server.kill("SIGTERM");
        await stopped;
      }
      if (directory) {
        await rm(directory, { recursive: true, force: true });
      }
    });

    beforeEach(async () => {
      await connection.flushdb();
      vi.mocked(redisClient.eval).mockImplementation(connection.eval.bind(connection));
      vi.mocked(redisClient.get).mockImplementation(connection.get.bind(connection));
      vi.mocked(redisClient.mget).mockImplementation(connection.mget.bind(connection));
      vi.mocked(redisClient.set).mockImplementation(connection.set.bind(connection));
      vi.mocked(redisClient.del).mockImplementation(connection.del.bind(connection));
      vi.mocked(redisClient.multi).mockImplementation(connection.multi.bind(connection));
      await connection.mset({
        "listener:call-1:playlist": "22",
        "listener:call-1:track": "1",
      });
    });

    it("claims a selection once and rejects an old menu's delayed callback", async () => {
      const oldSelector = await playlistService.startPlaylistSelection("call-1");
      const currentSelector = await playlistService.startPlaylistSelection("call-1");

      await expect(playlistService.claimPlaylistSelection("call-1", oldSelector)).resolves.toBe(false);
      const claims = await Promise.all([
        playlistService.claimPlaylistSelection("call-1", currentSelector),
        playlistService.claimPlaylistSelection("call-1", currentSelector),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      await expect(playlistService.getListenerMode("call-1")).resolves.toBe("selecting-playlist");
      await expect(connection.get("listener:call-1:selector-id")).resolves.toBeNull();
    });

    it("preserves the saved track and creates one menu when exiting the current agent", async () => {
      await playlistService.beginAgent("call-1", "agent-1");
      await expect(playlistService.getListenerMode("call-1")).resolves.toBe("agent");
      await expect(playlistService.getAgentSessionId("call-1")).resolves.toBe("agent-1");
      const outcomes = await Promise.all([
        playlistService.transitionFromAgent("call-1", "agent-1", "selecting-playlist"),
        playlistService.transitionFromAgent("call-1", "agent-1", "selecting-playlist"),
      ]);
      const selectorId = outcomes.find((value) => value !== null)!;
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(selectorId).toMatch(/^[0-9a-f-]{36}$/);
      await expect(playlistService.getAgentSessionId("call-1")).resolves.toBeNull();
      await expect(playlistService.claimPlaylistSelection("call-1", selectorId)).resolves.toBe(true);
      await expect(playlistService.getCurrentTrack("call-1")).resolves.toMatchObject({
        playlistNumber: "22",
        index: 1,
      });
    });

    it("ignores callbacks for another caller and previous agent sessions", async () => {
      await playlistService.beginAgent("call-1", "agent-new");
      await playlistService.beginAgent("call-2", "agent-other");

      await expect(playlistService.transitionFromAgent("call-1", "agent-old", "playing")).resolves.toBeNull();
      await expect(playlistService.transitionFromAgent("call-1", "agent-other", "playing")).resolves.toBeNull();
      await expect(playlistService.getAgentSessionId("call-1")).resolves.toBe("agent-new");
      await expect(playlistService.getAgentSessionId("call-2")).resolves.toBe("agent-other");
    });

    it("returns to the saved track only once after agent failure", async () => {
      await playlistService.beginAgent("call-1", "agent-1");
      await expect(playlistService.transitionFromAgent("call-1", "agent-1", "playing")).resolves.toBe("agent-1");
      await expect(playlistService.transitionFromAgent("call-1", "agent-1", "playing")).resolves.toBeNull();
      await expect(playlistService.getListenerMode("call-1")).resolves.toBe("playing");
      await expect(playlistService.getAgentSessionId("call-1")).resolves.toBeNull();
      await expect(playlistService.getCurrentTrack("call-1")).resolves.toMatchObject({
        playlistNumber: "22",
        index: 1,
      });
    });

    it.each(["start", "resume", "discord", "commit"])(
      "invalidates outstanding agent and selector callbacks after %s",
      async (operation) => {
        await playlistService.beginAgent("call-1", "agent-1");
        await connection.set("listener:call-1:selector-id", "stale-selector");
        if (operation === "start") {
          await playlistService.startPlaylist("call-1");
        } else if (operation === "resume") {
          await playlistService.resumePlayback("call-1");
        } else if (operation === "discord") {
          await playlistService.beginDiscordBridge("call-1", "80");
        } else {
          await playlistService.commitTrack("call-1", "22", 1);
        }

        await expect(playlistService.getAgentSessionId("call-1")).resolves.toBeNull();
        await expect(connection.get("listener:call-1:selector-id")).resolves.toBeNull();
        await expect(playlistService.transitionFromAgent("call-1", "agent-1", "playing")).resolves.toBeNull();
        await expect(playlistService.claimPlaylistSelection("call-1", "stale-selector")).resolves.toBe(false);
      },
    );

    it("invalidates the agent on menu entry and the menu when starting another agent", async () => {
      await playlistService.beginAgent("call-1", "agent-1");
      const selectorId = await playlistService.startPlaylistSelection("call-1");
      await expect(playlistService.getAgentSessionId("call-1")).resolves.toBeNull();
      await expect(playlistService.transitionFromAgent("call-1", "agent-1", "playing")).resolves.toBeNull();
      await playlistService.beginAgent("call-1", "agent-2");
      await expect(playlistService.claimPlaylistSelection("call-1", selectorId)).resolves.toBe(false);
      await expect(connection.get("listener:call-1:selector-id")).resolves.toBeNull();
    });

    it.each(["agent", "selecting-playlist"])(
      "cannot overwrite %s mode when a track lookup finishes late",
      async (mode) => {
        await playlistService.resumePlayback("call-1");
        let completeStat!: () => void;
        let statStarted!: () => void;
        const started = new Promise<void>((resolve) => { statStarted = resolve; });
        const pendingStat = new Promise<void>((resolve) => { completeStat = resolve; });
        vi.mocked(stat).mockImplementationOnce(async () => {
          statStarted();
          await pendingStat;
          return { size: 400 } as Awaited<ReturnType<typeof stat>>;
        });
        const finished = playlistService.trackFinished("call-1", "22", 1);
        await started;
        if (mode === "agent") {
          await playlistService.beginAgent("call-1", "agent-1");
        } else {
          await playlistService.startPlaylistSelection("call-1");
        }
        completeStat();

        await expect(finished).resolves.toBeNull();
        await expect(playlistService.getListenerMode("call-1")).resolves.toBe(mode);
        await expect(connection.get("listener:call-1:track")).resolves.toBe("1");
      },
    );

    it("advances one track when duplicate finished callbacks arrive together", async () => {
      await playlistService.resumePlayback("call-1");
      const results = await Promise.all([
        playlistService.trackFinished("call-1", "22", 1),
        playlistService.trackFinished("call-1", "22", 1),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      await expect(connection.get("listener:call-1:track")).resolves.toBe("0");
      await expect(playlistService.getListenerMode("call-1")).resolves.toBe("playing");
    });

    it("advances legacy default-playlist state without a stored mode or playlist", async () => {
      await connection.del("listener:call-1:mode", "listener:call-1:playlist");

      await expect(playlistService.trackFinished("call-1", "1", 1)).resolves.toMatchObject({
        playlistNumber: "1",
        index: 2,
      });
      await expect(connection.get("listener:call-1:track")).resolves.toBe("2");
    });

    it("keeps two callers' queued songs stable and advances both into a live edit", async () => {
      await playlistService.commitTrack("call-1", "1", 0);
      await playlistService.commitTrack("call-2", "1", 1);
      publishRevision("1", ["default-1.mp3", "default-2.mp3"], "edited");

      await expect(playlistService.getCurrentTrack("call-1")).resolves.toMatchObject({ filePath: "default-0.mp3" });
      await expect(playlistService.getCurrentTrack("call-2")).resolves.toMatchObject({ filePath: "default-1.mp3" });
      await expect(playlistService.trackFinished("call-1", "1", 0, "revision-1-initial"))
        .resolves.toMatchObject({ filePath: "default-1.mp3", index: 0, catalogRevision: "edited" });
      await expect(playlistService.getCurrentTrack("call-2")).resolves.toMatchObject({ catalogRevision: "revision-1-initial" });
      await expect(playlistService.trackFinished("call-2", "1", 1, "revision-1-initial"))
        .resolves.toMatchObject({ filePath: "default-2.mp3", index: 1, catalogRevision: "edited" });
      await expect(playlistService.trackFinished("call-1", "1", 0, "revision-1-initial")).resolves.toBeNull();
      await expect(playlistService.getCurrentTrack("call-1")).resolves.toMatchObject({ filePath: "default-1.mp3" });
    });

    it("rechecks the queued revision after async lookup even when a newer track has the same index", async () => {
      await playlistService.commitTrack("call-1", "1", 0);
      let completeStat!: () => void;
      let statStarted!: () => void;
      const started = new Promise<void>((resolve) => { statStarted = resolve; });
      const pendingStat = new Promise<void>((resolve) => { completeStat = resolve; });
      vi.mocked(stat).mockImplementationOnce(async () => {
        statStarted();
        await pendingStat;
        return { size: 200 } as Awaited<ReturnType<typeof stat>>;
      });
      const finished = playlistService.trackFinished("call-1", "1", 0, "revision-1-initial");
      await started;
      publishRevision("1", ["default-1.mp3", "default-2.mp3"], "edited");
      await playlistService.commitTrack("call-1", "1", 0);
      completeStat();

      await expect(finished).resolves.toBeNull();
      await expect(playlistService.getCurrentTrack("call-1")).resolves.toMatchObject({
        filePath: "default-1.mp3", index: 0, catalogRevision: "edited",
      });
    });
  },
);
