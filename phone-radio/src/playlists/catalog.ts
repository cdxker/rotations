import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { playlists as configuredPlaylists, type Playlist } from "./index.js";

export type PlaylistRevision = {
  readonly number: string;
  readonly name: string;
  readonly revision: string;
  readonly tracks: readonly string[];
  readonly songIds: readonly string[];
};

export type PlaylistMutation = {
  kind: "add" | "move" | "remove";
  /** Destination for add/move; source for remove. */
  playlistNumber: string;
  sourcePlaylistNumber?: string;
  songId?: string;
  filePath?: string;
  /** One-based final position; omitted additions append. */
  position?: number;
};

export type PlaylistMutationResult = {
  changed: boolean;
  playlists: PlaylistRevision[];
  playlistNumber: string;
  playlistName: string;
  songId: string;
  title: string;
  position: number;
  sourcePlaylistNumber?: string;
};

type CatalogOptions = {
  playlists?: Playlist[];
  sourceDir?: string;
  songListPath?: string;
};

type ParsedPlaylist = {
  source: ts.SourceFile;
  array: ts.ArrayLiteralExpression;
  tracks: string[];
};

type FileChange = { path: string; before: string | null; after: string };
class CatalogError extends Error {}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function makeRevision(playlist: Playlist, songIds?: readonly string[]): PlaylistRevision {
  const occurrences = new Map<string, number>();
  const ids = songIds ?? playlist.tracks.map((path) => {
    const occurrence = occurrences.get(path) ?? 0;
    occurrences.set(path, occurrence + 1);
    return hash(`${playlist.number}\0${path}\0${occurrence}`);
  });
  return Object.freeze({
    number: playlist.number,
    name: playlist.name,
    revision: hash(JSON.stringify([playlist.number, playlist.name, playlist.tracks])),
    tracks: Object.freeze([...playlist.tracks]),
    songIds: Object.freeze([...ids]),
  });
}

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

/** Parse the known source shape without executing TypeScript or rewriting its formatting. */
function parsePlaylist(content: string, number: string): ParsedPlaylist {
  const source = ts.createSourceFile("playlist.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) throw new CatalogError("The playlist source has a syntax error. No songs were changed.");
  const declarations = new Map<string, ts.Expression>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        declarations.set(declaration.name.text, unwrap(declaration.initializer));
      }
    }
  }
  const candidates: ts.ArrayLiteralExpression[] = [];
  for (const initializer of declarations.values()) {
    if (!ts.isObjectLiteralExpression(initializer)) continue;
    const properties = new Map<string, ts.Expression>();
    for (const property of initializer.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name);
        if (name) properties.set(name, unwrap(property.initializer));
      }
    }
    const playlistNumber = properties.get("number");
    if (!playlistNumber || !ts.isStringLiteral(playlistNumber) || playlistNumber.text !== number) continue;
    let tracks = properties.get("tracks");
    if (tracks && ts.isIdentifier(tracks)) tracks = declarations.get(tracks.text);
    if (tracks && ts.isArrayLiteralExpression(tracks)) candidates.push(tracks);
  }
  if (candidates.length !== 1) {
    throw new CatalogError("This playlist source cannot be edited safely. No songs were changed.");
  }
  const array = candidates[0];
  const tracks = array.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new CatalogError("This playlist contains an unsupported song entry. No songs were changed.");
    }
    return element.text;
  });
  return { source, array, tracks };
}

function commaBetween(content: string, start: number, end: number): number | null {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, content, undefined, start, end - start);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.CommaToken) return scanner.getTokenPos();
  }
  return null;
}

function removeEntry(content: string, number: string, index: number): string {
  const { source, array } = parsePlaylist(content, number);
  const element = array.elements[index];
  if (!element) throw new CatalogError("That song is no longer in the playlist. Please choose it again.");
  let comma = commaBetween(content, element.end, array.elements[index + 1]?.getStart(source) ?? array.end - 1);
  if (comma === null && index > 0) {
    comma = commaBetween(content, array.elements[index - 1].end, element.getStart(source));
  }
  const removals = [{ start: element.getStart(source), end: element.end }];
  if (comma !== null) removals.push({ start: comma, end: comma + 1 });
  for (const removal of removals.sort((a, b) => b.start - a.start)) {
    content = content.slice(0, removal.start) + content.slice(removal.end);
  }
  return content;
}

function insertEntry(content: string, number: string, index: number, path: string): string {
  const { source, array } = parsePlaylist(content, number);
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const first = array.elements[0];
  const firstStart = first?.getStart(source) ?? array.getStart(source);
  const lineStart = content.lastIndexOf("\n", firstStart - 1) + 1;
  const existingIndent = /^\s*/.exec(content.slice(lineStart, firstStart))![0];
  const indent = first ? existingIndent : `${existingIndent}  `;
  const quoted = JSON.stringify(path);
  const next = array.elements[index];
  if (next) {
    const at = next.getStart(source);
    return `${content.slice(0, at)}${quoted},${newline}${indent}${content.slice(at)}`;
  }
  const last = array.elements.at(-1);
  if (!last) {
    const at = array.getStart(source) + 1;
    return `${content.slice(0, at)}${newline}${indent}${quoted},${newline}${existingIndent}${content.slice(at)}`;
  }
  const comma = commaBetween(content, last.end, array.end - 1);
  const at = comma === null ? last.end : comma + 1;
  const insertion = comma === null ? `,${newline}${indent}${quoted}` : `${newline}${indent}${quoted},`;
  return content.slice(0, at) + insertion + content.slice(at);
}

function sameTracks(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CatalogError("The request was cancelled before the playlist was changed.");
}

function positionIndex(position: number | undefined, length: number): number {
  if (position === undefined) return length;
  if (!Number.isInteger(position) || position < 1 || position > length + 1) {
    throw new CatalogError(`Choose a song position from 1 to ${length + 1}.`);
  }
  return position - 1;
}

/** Persist source edits first, then atomically publish immutable playback revisions. */
export class PlaylistCatalog {
  readonly #current = new Map<string, PlaylistRevision>();
  readonly #revisions = new Map<string, Map<string, PlaylistRevision>>();
  readonly #mirrors: Playlist[];
  readonly #sourceDir: string;
  readonly #songListPath: string;
  #pending: Promise<void> = Promise.resolve();
  #needsRepair = false;

  constructor(options: CatalogOptions = {}) {
    this.#mirrors = options.playlists ?? configuredPlaylists;
    this.#sourceDir = options.sourceDir ?? fileURLToPath(new URL("../../src/playlists/", import.meta.url));
    this.#songListPath = options.songListPath ?? fileURLToPath(new URL("../../song-list.txt", import.meta.url));
    for (const playlist of this.#mirrors) {
      let tracks = playlist.tracks;
      try {
        // Runtime edits remain authoritative across restarts before the next build.
        tracks = parsePlaylist(readFileSync(this.sourcePath(playlist.number), "utf8"), playlist.number).tracks;
      } catch {
        // Source-less installs can still play their compiled playlists. Mutations
        // must subsequently validate the actual source before changing anything.
      }
      this.publish(makeRevision({ ...playlist, tracks }));
    }
  }

  public current(number: string): PlaylistRevision | null {
    return this.#current.get(number) ?? null;
  }

  public revision(number: string, revisionId: string): PlaylistRevision | null {
    return this.#revisions.get(number)?.get(revisionId) ?? null;
  }

  public list(): PlaylistRevision[] {
    return [...this.#current.values()];
  }

  public mutate(change: PlaylistMutation, signal?: AbortSignal): Promise<PlaylistMutationResult> {
    const operation = this.#pending.then(async () => {
      try {
        return await this.applyMutation(change, signal);
      } catch (error) {
        if (error instanceof CatalogError) throw error;
        throw new CatalogError("The playlist could not be saved. No songs were changed.");
      }
    });
    this.#pending = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private sourcePath(number: string): string {
    if (!/^[1-9]\d*$/.test(number)) throw new CatalogError("That playlist does not exist.");
    return join(this.#sourceDir, number === "1" ? "default.ts" : `playlist-${number}.ts`);
  }

  private publish(revision: PlaylistRevision): PlaylistRevision {
    const history = this.#revisions.get(revision.number) ?? new Map<string, PlaylistRevision>();
    // The same content always denotes the same immutable revision, including
    // its occurrence IDs, even after songs are removed and subsequently added.
    const canonical = history.get(revision.revision) ?? revision;
    this.#current.set(revision.number, canonical);
    history.set(revision.revision, canonical);
    this.#revisions.set(revision.number, history);
    const mirror = this.#mirrors.find((playlist) => playlist.number === revision.number);
    if (mirror) mirror.tracks.splice(0, mirror.tracks.length, ...canonical.tracks);
    return canonical;
  }

  private async applyMutation(change: PlaylistMutation, signal?: AbortSignal): Promise<PlaylistMutationResult> {
    if (this.#needsRepair) throw new CatalogError("An operator must check the playlist files before more changes.");
    checkAbort(signal);
    const target = this.current(change.playlistNumber);
    if (!target) throw new CatalogError("That playlist does not exist. Please choose a listed playlist.");
    const source = change.kind === "move" ? this.current(change.sourcePlaylistNumber ?? "") : target;
    if (!source) throw new CatalogError("The source playlist does not exist. Please choose a listed playlist.");
    if (!["add", "move", "remove"].includes(change.kind)) throw new CatalogError("That playlist action is not supported.");
    const sourceIndex = source.songIds.indexOf(change.songId ?? "");
    let filePath: string;
    if (change.kind === "add") {
      if (!change.filePath || !isAbsolute(change.filePath) || !change.filePath.toLowerCase().endsWith(".mp3")) {
        throw new CatalogError("Choose a downloaded MP3 song to add.");
      }
      filePath = change.filePath;
      if (!(await stat(filePath)).isFile()) throw new CatalogError("That downloaded song is unavailable.");
    } else {
      if (sourceIndex < 0) throw new CatalogError("That song is no longer in the playlist. Please choose it again.");
      filePath = source.tracks[sourceIndex];
      if (source.tracks.length === 1 && (change.kind === "remove" || source.number !== target.number)) {
        throw new CatalogError("A playlist must keep at least one song. Add another song before removing this one.");
      }
    }
    const targetIndex = target.tracks.indexOf(filePath);
    const result = (changed: boolean, revisions: PlaylistRevision[], songId: string, index: number): PlaylistMutationResult => ({
      changed,
      playlists: revisions,
      playlistNumber: target.number,
      playlistName: target.name,
      songId,
      title: basename(filePath, ".mp3"),
      position: index + 1,
      ...(change.kind === "move" ? { sourcePlaylistNumber: source.number } : {}),
    });
    if (change.kind === "add" && targetIndex >= 0) return result(false, [target], target.songIds[targetIndex], targetIndex);
    if (change.kind === "move" && source.number === target.number && change.position === undefined) {
      return result(false, [target], source.songIds[sourceIndex], sourceIndex);
    }

    const involved = source.number === target.number ? [target] : [source, target];
    const originals = new Map<string, string>();
    const contents = new Map<string, string>();
    const tracks = new Map(involved.map((playlist) => [playlist.number, [...playlist.tracks]]));
    const ids = new Map(involved.map((playlist) => [playlist.number, [...playlist.songIds]]));
    for (const playlist of involved) {
      const content = await readFile(this.sourcePath(playlist.number), "utf8");
      if (!sameTracks(parsePlaylist(content, playlist.number).tracks, playlist.tracks)) {
        throw new CatalogError("This playlist was edited outside the agent. Reload the catalog before trying again.");
      }
      originals.set(playlist.number, content);
      contents.set(playlist.number, content);
    }
    checkAbort(signal);
    let selectedId = source.songIds[sourceIndex];
    let selectedIndex = sourceIndex;
    if (change.kind === "remove" || change.kind === "move") {
      contents.set(source.number, removeEntry(contents.get(source.number)!, source.number, sourceIndex));
      tracks.get(source.number)!.splice(sourceIndex, 1);
      ids.get(source.number)!.splice(sourceIndex, 1);
    }
    if (change.kind === "add" || change.kind === "move") {
      const targetTracks = tracks.get(target.number)!;
      const duplicateIndex = change.kind === "move" && source.number === target.number
        ? -1 : targetTracks.indexOf(filePath);
      if (duplicateIndex >= 0) {
        selectedIndex = duplicateIndex;
        selectedId = ids.get(target.number)![duplicateIndex];
      } else {
        selectedIndex = positionIndex(change.position, targetTracks.length);
        selectedId = source.number === target.number && change.kind === "move" ? selectedId : randomUUID();
        contents.set(target.number, insertEntry(contents.get(target.number)!, target.number, selectedIndex, filePath));
        targetTracks.splice(selectedIndex, 0, filePath);
        ids.get(target.number)!.splice(selectedIndex, 0, selectedId);
      }
    }
    const next = involved.map((playlist) => makeRevision({
      number: playlist.number,
      name: playlist.name,
      tracks: tracks.get(playlist.number)!,
    }, ids.get(playlist.number)!));
    const fileChanges: FileChange[] = [];
    for (const playlist of next) {
      const after = contents.get(playlist.number)!;
      if (!sameTracks(parsePlaylist(after, playlist.number).tracks, playlist.tracks)) {
        throw new CatalogError("The playlist edit could not be verified. No songs were changed.");
      }
      const before = originals.get(playlist.number)!;
      if (before !== after) fileChanges.push({ path: this.sourcePath(playlist.number), before, after });
    }
    const nextByNumber = new Map(next.map((playlist) => [playlist.number, playlist]));
    const songList = this.list().flatMap((playlist) => {
      const current = nextByNumber.get(playlist.number) ?? playlist;
      return [`# ${current.number}. ${current.name}`, ...current.tracks.map((path, index) =>
        `${index + 1}. ${path.startsWith("/home/cdxker/Music/Ricky/") ? path.slice("/home/cdxker/Music/Ricky/".length) : path}`)];
    }).join("\n\n") + "\n";
    const oldSongList = await this.readOptional(this.#songListPath);
    if (oldSongList !== songList) fileChanges.push({ path: this.#songListPath, before: oldSongList, after: songList });
    await this.writeTransaction(fileChanges, signal);
    // No await between the successful transaction and publishing all revisions.
    const published = next.map((revision) => this.publish(revision));
    if (change.kind !== "remove") selectedId = this.current(target.number)!.songIds[selectedIndex];
    return result(true, published, selectedId, selectedIndex);
  }

  private async readOptional(path: string): Promise<string | null> {
    try { return await readFile(path, "utf8"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async writeTransaction(changes: FileChange[], signal?: AbortSignal): Promise<void> {
    const staged = new Map<string, string>();
    const committed: FileChange[] = [];
    try {
      for (const change of changes) {
        checkAbort(signal);
        const temp = `${change.path}.${randomUUID()}.tmp`;
        staged.set(change.path, temp);
        await writeFile(temp, change.after, { flag: "wx", mode: 0o644 });
      }
      for (const change of changes) {
        checkAbort(signal);
        if (await this.readOptional(change.path) !== change.before) {
          throw new CatalogError("A playlist file changed during this request. Please try again.");
        }
        await rename(staged.get(change.path)!, change.path);
        committed.push(change);
        staged.delete(change.path);
      }
      checkAbort(signal);
    } catch (error) {
      let rollbackFailed = false;
      for (const change of committed.reverse()) {
        try {
          // Never overwrite another editor's subsequent work during recovery.
          if (await this.readOptional(change.path) !== change.after) { rollbackFailed = true; continue; }
          if (change.before === null) await unlink(change.path);
          else {
            const temp = `${change.path}.${randomUUID()}.tmp`;
            staged.set(change.path, temp);
            await writeFile(temp, change.before, { flag: "wx", mode: 0o644 });
            await rename(temp, change.path);
            staged.delete(change.path);
          }
        } catch { rollbackFailed = true; }
      }
      if (rollbackFailed) {
        this.#needsRepair = true;
        throw new CatalogError("The edit could not be completed or fully restored. An operator must check the playlist files before more changes.");
      }
      throw error;
    } finally {
      await Promise.all([...staged.values()].map((path) => unlink(path).catch(() => undefined)));
    }
  }
}

export const playlistCatalog = new PlaylistCatalog();
