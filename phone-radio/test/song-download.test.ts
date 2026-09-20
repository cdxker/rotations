import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalSongUrl, runSongCommand, SongDownloader, type SongCommandRunner } from "../src/agent/song-download.js";

const VIDEO = "https://www.youtube.com/watch?v=abcdefghijk";
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "radio-song-download-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("canonicalSongUrl", () => {
  it.each([
    VIDEO,
    "https://youtu.be/abcdefghijk?t=3",
    "https://music.youtube.com/watch?v=abcdefghijk&list=ignored",
    "https://m.youtube.com/shorts/abcdefghijk",
  ])("normalizes a single video and removes unrelated query parameters: %s", (url) => {
    expect(canonicalSongUrl(url)).toBe(VIDEO);
  });

  it.each([
    "file:///etc/passwd", "http://127.0.0.1/audio", "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://youtube.com@evil.test/watch?v=abcdefghijk", "https://evil.test@youtube.com/watch?v=abcdefghijk",
    "https://youtube.com/playlist?list=abcdefghijk", "https://youtube.com/watch?v=bad",
    "https://youtu.be/abcdefghijk/extra", "https://youtube.com:8080/watch?v=abcdefghijk",
  ])("rejects non-video or untrusted URLs before execution: %s", async (url) => {
    const run = vi.fn<SongCommandRunner>();
    await expect(new SongDownloader({ musicDir: directory, run }).download(url)).rejects.toThrow(/YouTube/);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("SongDownloader.search", () => {
  it("passes a bounded search as one argument, keeps valid unique videos, and bounds metadata", async () => {
    const run = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: [
      JSON.stringify({ id: "abcdefghijk", title: "A song\nname", channel: "An artist", duration: 203 }),
      JSON.stringify({ id: "abcdefghijk", title: "Duplicate" }),
      JSON.stringify({ id: "lmnopqrstuv", title: "X".repeat(400), uploader: "Y".repeat(200), duration: -5 }),
      JSON.stringify({ id: "bad", title: "Bad id" }), "not json", "null",
      JSON.stringify({ id: "12345678901", title: "" }),
    ].join("\n") });
    const results = await new SongDownloader({ musicDir: directory, run }).search("artist $(touch /tmp/nope)");
    expect(run).toHaveBeenCalledWith("/home/cdxker/.local/bin/yt-dlp", [
      "--flat-playlist", "--dump-json", "--skip-download", "--", "ytsearch5:artist $(touch /tmp/nope)",
    ], expect.objectContaining({ cwd: directory, timeoutMs: 30_000, maxOutputBytes: 1_048_576 }));
    expect(results).toEqual([
      { id: "abcdefghijk", title: "A song name", artist: "An artist", duration: 203, url: VIDEO },
      { id: "lmnopqrstuv", title: "X".repeat(300), artist: "Y".repeat(160), url: "https://www.youtube.com/watch?v=lmnopqrstuv" },
    ]);
  });

  it("rejects blank, control-character and overlong queries without spawning", async () => {
    const run = vi.fn<SongCommandRunner>();
    const downloader = new SongDownloader({ musicDir: directory, run });
    for (const query of [" ", "bad\nquery", "x".repeat(301)]) {
      await expect(downloader.search(query)).rejects.toThrow(/song or artist/);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("returns no more than five matches", async () => {
    const run = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: Array.from({ length: 7 }, (_, i) =>
      JSON.stringify({ id: `abcdefghij${i}`, title: `Song ${i}` })).join("\n") });
    expect(await new SongDownloader({ musicDir: directory, run }).search("artist")).toHaveLength(5);
  });

  it("does not expose provider stderr, paths or cookies through errors", async () => {
    const run = vi.fn<SongCommandRunner>().mockRejectedValue(new Error("private-cookie=value /private/path"));
    await expect(new SongDownloader({ musicDir: directory, run }).search("artist")).rejects.toThrow(
      "Song search failed. Please try again.",
    );
  });
});

describe("SongDownloader.download", () => {
  it("uses the skill's wrapper and final output filename, preserving Unicode and spaces", async () => {
    const filePath = join(directory, "Artíst - A song [abcdefghijk].mp3");
    await writeFile(filePath, "fake mp3 for path validation");
    const run = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: `[download] completed\n${filePath}\n` });
    const result = await new SongDownloader({ musicDir: directory, run }).download("https://youtu.be/abcdefghijk?t=99");
    expect(run).toHaveBeenCalledWith("/home/cdxker/.scripts/hackerscripts/new-music", [
      "--no-playlist", "--no-simulate", "--no-progress", "--print", "after_move:filepath", "--", VIDEO,
    ], expect.objectContaining({ cwd: directory, timeoutMs: 120_000, maxOutputBytes: 1_048_576 }));
    expect(result).toEqual({ filePath, title: "Artíst - A song [abcdefghijk]" });
  });

  it("resolves relative output filenames within the configured music directory", async () => {
    await writeFile(join(directory, "song.mp3"), "audio");
    const run = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: "song.mp3\n" });
    expect(await new SongDownloader({ musicDir: directory, run }).download(VIDEO)).toEqual({
      filePath: join(directory, "song.mp3"), title: "song",
    });
  });

  it("rejects traversal and symlinks escaping the music directory", async () => {
    const musicDir = join(directory, "music");
    const outsideFile = join(directory, "outside.mp3");
    await mkdir(musicDir);
    await writeFile(outsideFile, "audio");
    await symlink(outsideFile, join(musicDir, "alias.mp3"));
    for (const output of ["../outside.mp3", outsideFile, "alias.mp3"]) {
      const run = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: output });
      await expect(new SongDownloader({ musicDir, run }).download(VIDEO)).rejects.toThrow(/usable MP3/);
    }
    expect(await readFile(outsideFile, "utf8")).toBe("audio");
  });

  it("rejects missing, empty, wrong-format, and directory results", async () => {
    await writeFile(join(directory, "empty.mp3"), "");
    await writeFile(join(directory, "song.wav"), "audio");
    await mkdir(join(directory, "folder.mp3"));
    for (const output of ["", "missing.mp3", "empty.mp3", "song.wav", "folder.mp3"]) {
      const run = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: output });
      await expect(new SongDownloader({ musicDir: directory, run }).download(VIDEO)).rejects.toThrow(/usable MP3/);
    }
  });

  it("cancels before execution or after an in-flight download without returning a usable result", async () => {
    const signal = AbortSignal.abort();
    const run = vi.fn<SongCommandRunner>();
    const downloader = new SongDownloader({ musicDir: directory, run });
    await expect(downloader.download(VIDEO, signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(run).not.toHaveBeenCalled();
    const controller = new AbortController();
    run.mockImplementation(async () => {
      controller.abort();
      return { stdout: "song.mp3" };
    });
    await expect(downloader.download(VIDEO, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("sanitizes command failures", async () => {
    const run = vi.fn<SongCommandRunner>().mockRejectedValue(new Error("private-cookie=value /private/path"));
    await expect(new SongDownloader({ musicDir: directory, run }).download(VIDEO)).rejects.toThrow(
      "Song download failed. The playlist was not changed.",
    );
  });

  it("serializes downloads across instances sharing the resolved music directory", async () => {
    await writeFile(join(directory, "song.mp3"), "audio");
    let finishFirst!: (result: { stdout: string }) => void;
    const firstRun = vi.fn<SongCommandRunner>().mockImplementation(() => new Promise((resolve) => { finishFirst = resolve; }));
    const secondRun = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: "song.mp3" });
    const first = new SongDownloader({ musicDir: directory, run: firstRun }).download(VIDEO);
    const second = new SongDownloader({ musicDir: `${directory}/.`, run: secondRun }).download(VIDEO);
    await vi.waitFor(() => expect(firstRun).toHaveBeenCalledOnce());
    expect(secondRun).not.toHaveBeenCalled();
    finishFirst({ stdout: "song.mp3" });
    await expect(first).resolves.toMatchObject({ title: "song" });
    await expect(second).resolves.toMatchObject({ title: "song" });
    expect(secondRun).toHaveBeenCalledOnce();
  });

  it("promptly cancels a queued waiter without spawning it or bypassing the active download", async () => {
    await writeFile(join(directory, "song.mp3"), "audio");
    let finishFirst!: (result: { stdout: string }) => void;
    const firstRun = vi.fn<SongCommandRunner>().mockImplementation(() => new Promise((resolve) => { finishFirst = resolve; }));
    const cancelledRun = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: "song.mp3" });
    const lastRun = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: "song.mp3" });
    const controller = new AbortController();
    const first = new SongDownloader({ musicDir: directory, run: firstRun }).download(VIDEO);
    const waiter = new SongDownloader({ musicDir: directory, run: cancelledRun }).download(VIDEO, controller.signal);
    const last = new SongDownloader({ musicDir: directory, run: lastRun }).download(VIDEO);
    await vi.waitFor(() => expect(firstRun).toHaveBeenCalledOnce());
    controller.abort();
    // Cancellation completes while the first download is still blocked.
    await expect(waiter).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelledRun).not.toHaveBeenCalled();
    expect(lastRun).not.toHaveBeenCalled();
    finishFirst({ stdout: "song.mp3" });
    await first;
    await last;
    expect(cancelledRun).not.toHaveBeenCalled();
    expect(lastRun).toHaveBeenCalledOnce();
  });

  it("releases the queue after failed path validation", async () => {
    await writeFile(join(directory, "song.mp3"), "audio");
    const failedRun = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: "missing.mp3" });
    const nextRun = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: "song.mp3" });
    const failed = new SongDownloader({ musicDir: directory, run: failedRun }).download(VIDEO);
    const next = new SongDownloader({ musicDir: directory, run: nextRun }).download(VIDEO);
    await expect(failed).rejects.toThrow(/usable MP3/);
    await expect(next).resolves.toMatchObject({ title: "song" });
  });

  it("allows unrelated music directories to download independently", async () => {
    const otherDirectory = join(directory, "other");
    await mkdir(otherDirectory);
    await writeFile(join(directory, "song.mp3"), "audio");
    await writeFile(join(otherDirectory, "song.mp3"), "audio");
    let finishFirst!: (result: { stdout: string }) => void;
    const firstRun = vi.fn<SongCommandRunner>().mockImplementation(() => new Promise((resolve) => { finishFirst = resolve; }));
    const otherRun = vi.fn<SongCommandRunner>().mockResolvedValue({ stdout: "song.mp3" });
    const first = new SongDownloader({ musicDir: directory, run: firstRun }).download(VIDEO);
    const other = new SongDownloader({ musicDir: otherDirectory, run: otherRun }).download(VIDEO);
    await expect(other).resolves.toMatchObject({ title: "song" });
    finishFirst({ stdout: "song.mp3" });
    await first;
  });
});

describe("runSongCommand", () => {
  const options = () => ({ cwd: directory, timeoutMs: 2_000, maxOutputBytes: 1_024 });

  it("captures stdout without disclosing stderr", async () => {
    await expect(runSongCommand(process.execPath, ["-e", "process.stdout.write('result'); process.stderr.write('secret')"], options()))
      .resolves.toEqual({ stdout: "result" });
    await expect(runSongCommand(process.execPath, ["-e", "process.stderr.write('secret'); process.exit(2)"], options()))
      .rejects.toThrow("The song command failed.");
  });

  it("bounds command time and combined output", async () => {
    await expect(runSongCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { ...options(), timeoutMs: 30 }))
      .rejects.toThrow("timed out");
    await expect(runSongCommand(process.execPath, ["-e", "process.stderr.write('x'.repeat(4096))"], options()))
      .rejects.toThrow("too much output");
  });

  it("cancels the wrapper and its child process together", async () => {
    const pidFile = join(directory, "child.pid");
    const marker = join(directory, "child-was-still-running");
    const controller = new AbortController();
    const script = `
      const {spawn} = require('node:child_process');
      const {writeFileSync} = require('node:fs');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'running'), 600);`)}], {stdio: 'ignore'});
      writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
      setInterval(() => {}, 1000);
    `;
    const result = runSongCommand(process.execPath, ["-e", script], { ...options(), signal: controller.signal });
    // Install a rejection handler before waiting for the child to start.
    const cancelled = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(async () => expect(Number(await readFile(pidFile, "utf8"))).toBeGreaterThan(0));
    controller.abort();
    await cancelled;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
