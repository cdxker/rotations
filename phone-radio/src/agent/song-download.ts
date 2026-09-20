import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

const MUSIC_DIRECTORY = "/home/cdxker/Music/Ricky";
const YT_DLP = "/home/cdxker/.local/bin/yt-dlp";
const NEW_MUSIC = "/home/cdxker/.scripts/hackerscripts/new-music";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// new-music/yt-dlp share filenames and intermediate files within a music directory.
const downloadQueues = new Map<string, Promise<void>>();

export interface SongCommandOptions {
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
}

export type SongCommandRunner = (
  command: string,
  args: string[],
  options: SongCommandOptions,
) => Promise<{ stdout: string }>;

export interface SongSearchResult {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  url: string;
}

function aborted(): Error {
  const error = new Error("The song request was cancelled.");
  error.name = "AbortError";
  return error;
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw aborted();
}

function queueDownload<T>(directory: string, signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
  checkCancellation(signal);
  const previous = downloadQueues.get(directory) ?? Promise.resolve();
  const result = previous.then(() => {
    checkCancellation(signal);
    return operation();
  });
  // Failures and cancelled waiters release their turn without poisoning later requests.
  const completed = result.then(() => undefined, () => undefined);
  downloadQueues.set(directory, completed);
  void completed.then(() => {
    if (downloadQueues.get(directory) === completed) downloadQueues.delete(directory);
  });
  if (!signal) return result;
  return new Promise<T>((resolveResult, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(aborted());
    };
    signal.addEventListener("abort", cancel, { once: true });
    result.then((value) => {
      signal.removeEventListener("abort", cancel);
      resolveResult(value);
    }, (error) => {
      signal.removeEventListener("abort", cancel);
      reject(error);
    });
    if (signal.aborted) cancel();
  });
}

/** A separate process group also stops yt-dlp/ffmpeg beneath the new-music shell. */
export const runSongCommand: SongCommandRunner = (command, args, options) => {
  return new Promise((resolveCommand, reject) => {
    if (options.signal?.aborted) {
      reject(aborted());
      return;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      // The skill's new-music wrapper resolves yt-dlp through PATH, including in tmux.
      env: { ...process.env, PATH: `/home/cdxker/.local/bin:${process.env.PATH ?? ""}` },
    });
    let settled = false;
    let stopReason: Error | undefined;
    let outputBytes = 0;
    const stdout: Buffer[] = [];
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolveCommand({ stdout: Buffer.concat(stdout).toString("utf8") });
    };
    const stop = (error: Error) => {
      if (settled || stopReason) return;
      stopReason = error;
      if (child.pid !== undefined) {
        try {
          if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
      // Keep the directory's queue slot until the child has actually closed.
    };
    const cancel = () => stop(aborted());
    const timer = setTimeout(
      () => stop(new Error("The song request timed out.")),
      options.timeoutMs,
    );
    options.signal?.addEventListener("abort", cancel, { once: true });
    const collect = (chunk: Buffer, keep: boolean) => {
      if (settled) return;
      outputBytes += chunk.byteLength;
      if (outputBytes > options.maxOutputBytes) {
        stop(new Error("The song request returned too much output."));
      } else if (keep) stdout.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, false));
    child.on("error", () => finish(stopReason ?? new Error("The song command could not be started.")));
    child.on("close", (code) => {
      finish(stopReason ?? (code === 0 ? undefined : new Error("The song command failed.")));
    });
    // Abort can happen between the first check and listener registration.
    if (options.signal?.aborted) cancel();
  });
};

/** Only a single YouTube video is accepted; playlist, local and arbitrary URLs cannot run. */
export function canonicalSongUrl(value: string): string {
  let url: URL;
  try {
    if (typeof value !== "string" || value.length > 2048) throw new Error();
    url = new URL(value);
  } catch {
    throw new Error("Use a valid YouTube video URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Use a valid HTTPS YouTube video URL.");
  }
  let id: string | null = null;
  if (["youtu.be", "www.youtu.be"].includes(url.hostname)) {
    id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !VIDEO_ID.test(id)) throw new Error("Use a YouTube URL for one video.");
  return `https://www.youtube.com/watch?v=${id}`;
}

function metadata(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, limit) : undefined;
}

export class SongDownloader {
  private readonly musicDir: string;
  private readonly run: SongCommandRunner;

  constructor(options: { musicDir?: string; run?: SongCommandRunner } = {}) {
    this.musicDir = resolve(options.musicDir ?? MUSIC_DIRECTORY);
    this.run = options.run ?? runSongCommand;
  }

  async search(query: string, signal?: AbortSignal): Promise<SongSearchResult[]> {
    checkCancellation(signal);
    if (typeof query !== "string" || !query.trim() || query.length > 300 || /[\u0000-\u001f\u007f]/.test(query)) {
      throw new Error("Give a song or artist to search for, using at most 300 characters.");
    }
    let stdout: string;
    try {
      ({ stdout } = await this.run(YT_DLP, [
        "--flat-playlist", "--dump-json", "--skip-download", "--", `ytsearch5:${query.trim()}`,
      ], { cwd: this.musicDir, timeoutMs: 30_000, maxOutputBytes: 1_048_576, signal }));
    } catch {
      checkCancellation(signal);
      throw new Error("Song search failed. Please try again.");
    }
    checkCancellation(signal);
    const results: SongSearchResult[] = [];
    const ids = new Set<string>();
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let item: Record<string, unknown>;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const id = item.id;
      const title = metadata(item.title, 300);
      if (typeof id !== "string" || !VIDEO_ID.test(id) || !title || ids.has(id)) continue;
      const artist = metadata(item.artist ?? item.channel ?? item.uploader, 160);
      const duration = typeof item.duration === "number" && Number.isFinite(item.duration)
        && item.duration >= 0 && item.duration <= 43_200 ? item.duration : undefined;
      ids.add(id);
      results.push({ id, title, ...(artist ? { artist } : {}), ...(duration !== undefined ? { duration } : {}),
        url: `https://www.youtube.com/watch?v=${id}` });
      if (results.length === 5) break;
    }
    return results;
  }

  async download(url: string, signal?: AbortSignal): Promise<{ filePath: string; title: string }> {
    checkCancellation(signal);
    const canonicalUrl = canonicalSongUrl(url);
    return queueDownload(this.musicDir, signal, () => this.downloadVideo(canonicalUrl, signal));
  }

  private async downloadVideo(canonicalUrl: string, signal?: AbortSignal): Promise<{ filePath: string; title: string }> {
    let stdout: string;
    try {
      ({ stdout } = await this.run(NEW_MUSIC, [
        "--no-playlist", "--no-simulate", "--no-progress", "--print", "after_move:filepath", "--", canonicalUrl,
      ], { cwd: this.musicDir, timeoutMs: 120_000, maxOutputBytes: 1_048_576, signal }));
    } catch {
      checkCancellation(signal);
      throw new Error("Song download failed. The playlist was not changed.");
    }
    checkCancellation(signal);
    const outputPath = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
    try {
      if (!outputPath || outputPath.includes("\u0000") || extname(outputPath).toLowerCase() !== ".mp3") throw new Error();
      const [root, filePath] = await Promise.all([
        realpath(this.musicDir), realpath(resolve(this.musicDir, outputPath)),
      ]);
      const childPath = relative(root, filePath);
      if (!childPath || isAbsolute(childPath) || childPath === ".." || childPath.startsWith(`..${sep}`)
        || extname(filePath).toLowerCase() !== ".mp3") throw new Error();
      const info = await stat(filePath);
      if (!info.isFile() || info.size === 0) throw new Error();
      checkCancellation(signal);
      return { filePath, title: metadata(basename(filePath, extname(filePath)), 300) ?? "Downloaded song" };
    } catch {
      checkCancellation(signal);
      throw new Error("The download did not produce a usable MP3 in the music folder. The playlist was not changed.");
    }
  }
}
