import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaylistCatalog } from "../src/playlists/catalog.js";
import type { Playlist } from "../src/playlists/index.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const realFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const directories: string[] = [];

beforeEach(() => {
  vi.mocked(rename).mockReset().mockImplementation(realFs.rename);
});

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(options: { duplicate?: boolean; targetDuplicate?: boolean; noTrailingComma?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "phone-radio-catalog-"));
  directories.push(directory);
  const paths = ["a", "b", "c", "d", "new", "extra"].map((name) => join(directory, `${name}.mp3`));
  await Promise.all(paths.map((path) => writeFile(path, "fixture audio")));
  const [a, b, c, d, added, extra] = paths;
  const firstTracks = options.duplicate ? [a, a, c] : [a, b, c];
  const secondTracks = options.targetDuplicate ? [b, d] : [d];
  const playlists: Playlist[] = [
    { number: "1", name: "Main", tracks: [...firstTracks] },
    { number: "2", name: "Second", tracks: [...secondTracks] },
  ];
  const source1 = join(directory, "default.ts");
  const source2 = join(directory, "playlist-2.ts");
  const songListPath = join(directory, "song-list.txt");
  const defaultSource = `// Keep the caller's header and declaration.\nconst unrelated = "untouched";\nconst defaultTracks = [\n  // Keep this comment.\n${firstTracks.map((path, index) => `  ${JSON.stringify(path)}${options.noTrailingComma && index === firstTracks.length - 1 ? "" : ","} // Song note ${index + 1}`).join("\n")}\n];\nconst defaultPlaylist = { number: "1", name: "Main", tracks: defaultTracks } satisfies Playlist;\nexport default defaultPlaylist;\n`;
  const secondSource = `const playlist = {\n  number: "2",\n  name: "Second",\n  tracks: [${secondTracks.map((path) => JSON.stringify(path)).join(", ")}],\n} satisfies Playlist;\nexport default playlist;\n`;
  await writeFile(source1, defaultSource);
  await writeFile(source2, secondSource);
  await writeFile(songListPath, "old song list\n");
  const catalog = new PlaylistCatalog({ playlists, sourceDir: directory, songListPath });
  return { directory, playlists, catalog, source1, source2, songListPath, defaultSource, secondSource, a, b, c, d, added, extra };
}

describe("PlaylistCatalog", () => {
  it("reads authoritative source at startup and returns immutable content revisions", async () => {
    const f = await fixture();
    const saved = f.catalog.current("1")!;
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Object.isFrozen(saved.tracks)).toBe(true);
    expect(Object.isFrozen(saved.songIds)).toBe(true);
    expect(f.catalog.revision("1", saved.revision)).toBe(saved);
    expect(f.catalog.current("999")).toBeNull();
    expect(f.catalog.revision("1", "missing")).toBeNull();
    expect(f.catalog.list().map((playlist) => playlist.number)).toEqual(["1", "2"]);

    await writeFile(f.source1, f.defaultSource.replace(JSON.stringify(f.b), JSON.stringify(f.added)));
    const restarted = new PlaylistCatalog({ playlists: f.playlists, sourceDir: f.directory, songListPath: f.songListPath });
    expect(restarted.current("1")!.tracks).toEqual([f.a, f.added, f.c]);
    expect(f.playlists[0].tracks).toEqual([f.a, f.added, f.c]);
    expect(saved.tracks).toEqual([f.a, f.b, f.c]);
  });

  it("inserts a song at its requested position while preserving surrounding source and comments", async () => {
    const f = await fixture();
    const before = f.catalog.current("1")!;
    const result = await f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added, position: 2 });
    const after = f.catalog.current("1")!;
    expect(result).toMatchObject({ changed: true, playlistNumber: "1", playlistName: "Main", title: "new", position: 2 });
    expect(after.tracks).toEqual([f.a, f.added, f.b, f.c]);
    expect(after.songIds).toEqual([before.songIds[0], result.songId, before.songIds[1], before.songIds[2]]);
    expect(f.catalog.revision("1", before.revision)).toBe(before);
    expect(f.playlists[0].tracks).toEqual(after.tracks);
    const source = await readFile(f.source1, "utf8");
    expect(source).toContain('// Keep the caller\'s header and declaration.\nconst unrelated = "untouched";');
    expect(source).toContain("// Keep this comment.");
    expect(source).toContain("// Song note 1");
    expect(source).toContain("// Song note 2");
    expect(source).toContain("// Song note 3");
    expect(source.split("const defaultPlaylist = ")[1]).toBe(f.defaultSource.split("const defaultPlaylist = ")[1]);
    expect(await readFile(f.source2, "utf8")).toBe(f.secondSource);
    expect(await readFile(f.songListPath, "utf8")).toContain(`2. ${f.added}`);
  });

  it.each([false, true])("appends safely with missing trailing comma: %s", async (noTrailingComma) => {
    const f = await fixture({ noTrailingComma });
    await f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added });
    const restarted = new PlaylistCatalog({ playlists: f.playlists, sourceDir: f.directory, songListPath: f.songListPath });
    expect(restarted.current("1")!.tracks).toEqual([f.a, f.b, f.c, f.added]);
    expect(restarted.current("1")!.revision).toBe(f.catalog.current("1")!.revision);
  });

  it("moves across playlists in one transaction and retains the queued revisions", async () => {
    const f = await fixture();
    const before1 = f.catalog.current("1")!;
    const before2 = f.catalog.current("2")!;
    const result = await f.catalog.mutate({ kind: "move", sourcePlaylistNumber: "1", playlistNumber: "2", songId: before1.songIds[1], position: 1 });
    expect(result).toMatchObject({ changed: true, sourcePlaylistNumber: "1", playlistNumber: "2", position: 1 });
    expect(f.catalog.current("1")!.tracks).toEqual([f.a, f.c]);
    expect(f.catalog.current("1")!.songIds).toEqual([before1.songIds[0], before1.songIds[2]]);
    expect(f.catalog.current("2")!.tracks).toEqual([f.b, f.d]);
    expect(f.catalog.current("2")!.songIds[1]).toBe(before2.songIds[0]);
    expect(f.catalog.revision("1", before1.revision)!.tracks).toEqual([f.a, f.b, f.c]);
    expect(f.catalog.revision("2", before2.revision)!.tracks).toEqual([f.d]);
  });

  it("does not duplicate a song already in the destination when moving it", async () => {
    const f = await fixture({ targetDuplicate: true });
    const destination = f.catalog.current("2")!;
    await f.catalog.mutate({ kind: "move", sourcePlaylistNumber: "1", playlistNumber: "2", songId: f.catalog.current("1")!.songIds[1] });
    expect(f.catalog.current("1")!.tracks).toEqual([f.a, f.c]);
    expect(f.catalog.current("2")!.tracks).toEqual([f.b, f.d]);
    expect(f.catalog.current("2")!.songIds).toEqual(destination.songIds);
    expect(await readFile(f.source2, "utf8")).toBe(f.secondSource);
  });

  it("distinguishes duplicate occurrences and removes only the chosen membership", async () => {
    const f = await fixture({ duplicate: true });
    const before = f.catalog.current("1")!;
    expect(before.songIds[0]).not.toBe(before.songIds[1]);
    await f.catalog.mutate({ kind: "remove", playlistNumber: "1", songId: before.songIds[0] });
    expect(f.catalog.current("1")!.tracks).toEqual([f.a, f.c]);
    expect(f.catalog.current("1")!.songIds).toEqual([before.songIds[1], before.songIds[2]]);
    expect(await readFile(f.a, "utf8")).toBe("fixture audio");
    await expect(f.catalog.mutate({ kind: "remove", playlistNumber: "1", songId: before.songIds[0] })).rejects.toThrow("no longer");
  });

  it("reuses the immutable revision and its song IDs when an old track order is restored", async () => {
    const f = await fixture();
    const original = f.catalog.current("1")!;
    await f.catalog.mutate({ kind: "remove", playlistNumber: "1", songId: original.songIds[1] });
    const result = await f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.b, position: 2 });
    expect(f.catalog.current("1")).toBe(original);
    expect(f.catalog.revision("1", original.revision)).toBe(original);
    expect(result.songId).toBe(original.songIds[1]);
    expect(result.playlists[0]).toBe(original);
  });

  it("reorders the selected duplicate without collapsing another occurrence", async () => {
    const f = await fixture({ duplicate: true });
    const before = f.catalog.current("1")!;
    await f.catalog.mutate({ kind: "move", playlistNumber: "1", sourcePlaylistNumber: "1", songId: before.songIds[0], position: 3 });
    expect(f.catalog.current("1")!.tracks).toEqual([f.a, f.c, f.a]);
    expect(f.catalog.current("1")!.songIds).toEqual([before.songIds[1], before.songIds[2], before.songIds[0]]);
  });

  it("refuses to empty a playlist, use stale IDs, or persist missing audio", async () => {
    const f = await fixture();
    const songId = f.catalog.current("2")!.songIds[0];
    await expect(f.catalog.mutate({ kind: "remove", playlistNumber: "2", songId })).rejects.toThrow("at least one");
    await expect(f.catalog.mutate({ kind: "move", sourcePlaylistNumber: "2", playlistNumber: "1", songId })).rejects.toThrow("at least one");
    await expect(f.catalog.mutate({ kind: "remove", playlistNumber: "1", songId: "stale" })).rejects.toThrow("no longer");
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: join(f.directory, "private-missing.mp3") })).rejects.toThrow(/^The playlist could not be saved\. No songs were changed\.$/);
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added, position: 0 })).rejects.toThrow("position from 1 to 4");
    expect(await readFile(f.source1, "utf8")).toBe(f.defaultSource);
    expect(await readFile(f.source2, "utf8")).toBe(f.secondSource);
  });

  it("serializes concurrent adds and makes a repeated add idempotent", async () => {
    const f = await fixture();
    const results = await Promise.all([
      f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added }),
      f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.extra }),
      f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added }),
    ]);
    expect(results.map((result) => result.changed)).toEqual([true, true, false]);
    expect(f.catalog.current("1")!.tracks).toEqual([f.a, f.b, f.c, f.added, f.extra]);
    expect(results[2].songId).toBe(results[0].songId);
  });

  it("preserves an outside source edit and refuses stale mutation", async () => {
    const f = await fixture();
    const outsideEdit = f.defaultSource.replace(JSON.stringify(f.b), JSON.stringify(f.extra));
    await writeFile(f.source1, outsideEdit);
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added })).rejects.toThrow("edited outside");
    expect(await readFile(f.source1, "utf8")).toBe(outsideEdit);
    expect(f.catalog.current("1")!.tracks).toEqual([f.a, f.b, f.c]);
  });

  it("retains outside comments added before the mutation when the songs still match", async () => {
    const f = await fixture();
    await writeFile(f.source1, `${f.defaultSource}// A separate edit to preserve.\n`);
    await f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added });
    expect(await readFile(f.source1, "utf8")).toContain("// A separate edit to preserve.");
  });

  it("rejects unsupported dynamic source instead of evaluating or overwriting it", async () => {
    const f = await fixture();
    const dynamicSource = f.defaultSource.replace(JSON.stringify(f.b), 'process.env.PHONE_RADIO_TEST_TRACK');
    await writeFile(f.source1, dynamicSource);
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added })).rejects.toThrow("unsupported song entry");
    expect(await readFile(f.source1, "utf8")).toBe(dynamicSource);
  });

  it("rolls back both playlists when a multi-file move fails before publishing", async () => {
    const f = await fixture();
    const before = f.catalog.current("1")!;
    vi.mocked(rename).mockImplementationOnce(realFs.rename).mockRejectedValueOnce(new Error("sensitive disk failure"));
    await expect(f.catalog.mutate({ kind: "move", sourcePlaylistNumber: "1", playlistNumber: "2", songId: before.songIds[1] })).rejects.toThrow("No songs were changed");
    expect(f.catalog.current("1")).toBe(before);
    expect(await readFile(f.source1, "utf8")).toBe(f.defaultSource);
    expect(await readFile(f.source2, "utf8")).toBe(f.secondSource);
    expect(await readFile(f.songListPath, "utf8")).toBe("old song list\n");
    expect((await readdir(f.directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("rolls back source edits if refreshing the song list fails", async () => {
    const f = await fixture();
    const before = f.catalog.current("1")!;
    vi.mocked(rename).mockImplementationOnce(realFs.rename).mockRejectedValueOnce(new Error("write failed"));
    await expect(f.catalog.mutate({ kind: "remove", playlistNumber: "1", songId: before.songIds[1] })).rejects.toThrow("No songs were changed");
    expect(f.catalog.current("1")).toBe(before);
    expect(await readFile(f.source1, "utf8")).toBe(f.defaultSource);
    expect(await readFile(f.songListPath, "utf8")).toBe("old song list\n");
  });

  it("cancels before writes and rolls back an abort arriving during the transaction", async () => {
    const f = await fixture();
    const before = f.catalog.current("1")!;
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added }, cancelled.signal)).rejects.toThrow("cancelled");
    expect(rename).not.toHaveBeenCalled();

    const midflight = new AbortController();
    vi.mocked(rename).mockImplementationOnce(async (from, to) => {
      await realFs.rename(from, to);
      midflight.abort();
    });
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added }, midflight.signal)).rejects.toThrow("cancelled");
    expect(f.catalog.current("1")).toBe(before);
    expect(await readFile(f.source1, "utf8")).toBe(f.defaultSource);
    expect(await readFile(f.songListPath, "utf8")).toBe("old song list\n");
    expect((await readdir(f.directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("preserves concurrent outside edits during rollback and blocks additional mutation until repaired", async () => {
    const f = await fixture();
    const before = f.catalog.current("1")!;
    let agentSource = "";
    vi.mocked(rename).mockImplementationOnce(async (from, to) => {
      await realFs.rename(from, to);
      agentSource = await readFile(f.source1, "utf8");
    }).mockImplementationOnce(async () => {
      await writeFile(f.source1, `${agentSource}// An editor added this.\n`);
      throw new Error("song list failed");
    });
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.added })).rejects.toThrow("operator must check");
    expect(await readFile(f.source1, "utf8")).toContain("// An editor added this.");
    expect(f.catalog.current("1")).toBe(before);
    await expect(f.catalog.mutate({ kind: "add", playlistNumber: "1", filePath: f.extra })).rejects.toThrow("operator must check");
  });
});
