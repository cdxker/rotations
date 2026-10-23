import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
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

export type PlaylistCreation = {
  name: string;
  number?: string;
  filePath: string;
  /** Dial destinations, such as Discord rooms, that must remain available. */
  reservedNumbers?: readonly string[];
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
  name?: string;
};

type ParsedRegistry = {
  source: ts.SourceFile;
  array: ts.ArrayLiteralExpression;
  numbers: string[];
  importedNumbers: string[];
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
  const candidates: { array: ts.ArrayLiteralExpression; name?: string }[] = [];
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
    const name = properties.get("name");
    if (tracks && ts.isArrayLiteralExpression(tracks)) candidates.push({
      array: tracks,
      ...(name && ts.isStringLiteral(name) ? { name: name.text } : {}),
    });
  }
  if (candidates.length !== 1) {
    throw new CatalogError("This playlist source cannot be edited safely. No songs were changed.");
  }
  const { array, name } = candidates[0];
  const tracks = array.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new CatalogError("This playlist contains an unsupported song entry. No songs were changed.");
    }
    return element.text;
  });
  return { source, array, tracks, name };
}

/** Read only the literal registry shape; never execute playlist source. */
function parseRegistry(content: string): ParsedRegistry {
  const source = ts.createSourceFile("index.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  const fail = () => new CatalogError("The playlist registry cannot be edited safely. No playlists were added.");
  if (diagnostics.length) throw fail();
  const imports = new Map<string, string>();
  const arrays: ts.ArrayLiteralExpression[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.importClause?.name) {
      const module = statement.moduleSpecifier.text;
      const number = module === "./default.js" ? "1" : /^\.\/playlist-([1-9]\d*)\.js$/.exec(module)?.[1];
      if (number) imports.set(statement.importClause.name.text, number);
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "playlists" || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (!ts.isArrayLiteralExpression(initializer)) throw fail();
      arrays.push(initializer);
    }
  }
  if (arrays.length !== 1) throw fail();
  const array = arrays[0];
  const numbers = array.elements.map((element) => {
    if (!ts.isIdentifier(element)) throw fail();
    const number = imports.get(element.text);
    if (!number) throw fail();
    return number;
  });
  if (new Set(numbers).size !== numbers.length) throw fail();
  return { source, array, numbers, importedNumbers: [...imports.values()] };
}

function registerPlaylist(content: string, number: string): string {
  const { source, array } = parseRegistry(content);
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const identifiers = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    ts.forEachChild(node, collect);
  };
  collect(source);
  let identifier = `playlist${number}`;
  while (identifiers.has(identifier)) identifier = `_${identifier}`;
  const last = array.elements.at(-1);
  let entryAt: number;
  let entry: string;
  if (last) {
    const comma = commaBetween(content, last.end, array.end - 1);
    entryAt = comma === null ? last.end : comma + 1;
    const lineStart = content.lastIndexOf("\n", last.getStart(source) - 1) + 1;
    const indent = /^[\t ]*/.exec(content.slice(lineStart, last.getStart(source)))![0] || "  ";
    entry = `${comma === null ? "," : ""}${newline}${indent}${identifier}${comma === null ? "" : ","}`;
  } else {
    entryAt = array.getStart(source) + 1;
    entry = `${newline}  ${identifier},${newline}`;
  }
  const lastImport = source.statements.filter(ts.isImportDeclaration).at(-1);
  const lineEnd = lastImport ? content.indexOf("\n", lastImport.end) : -1;
  const importAt = lastImport ? (lineEnd === -1 ? content.length : lineEnd + 1) : source.statements[0]?.getStart(source) ?? content.length;
  const importText = `${lastImport && lineEnd === -1 ? newline : ""}import ${identifier} from ${JSON.stringify(number === "1" ? "./default.js" : `./playlist-${number}.js`)};${newline}`;
  for (const insertion of [{ at: entryAt, text: entry }, { at: importAt, text: importText }].sort((a, b) => b.at - a.at)) {
    content = content.slice(0, insertion.at) + insertion.text + content.slice(insertion.at);
  }
  if (!parseRegistry(content).numbers.includes(number)) throw new CatalogError("The new playlist registration could not be verified.");
  return content;
}

function songList(playlists: readonly PlaylistRevision[]): string {
  return playlists.flatMap((playlist) => [
    `# ${playlist.number}. ${playlist.name}`,
    ...playlist.tracks.map((path, index) => `${index + 1}. ${path.startsWith("/home/cdxker/Music/Ricky/") ? path.slice("/home/cdxker/Music/Ricky/".length) : path}`),
  ]).join("\n\n") + "\n";
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
      let name = playlist.name;
      try {
        // Runtime edits remain authoritative across restarts before the next build.
        const parsed = parsePlaylist(readFileSync(this.sourcePath(playlist.number), "utf8"), playlist.number);
        tracks = parsed.tracks;
        name = parsed.name ?? name;
      } catch {
        // Source-less installs can still play their compiled playlists. Mutations
        // must subsequently validate the actual source before changing anything.
      }
      this.publish(makeRevision({ ...playlist, name, tracks }));
    }
    try {
      // A running compiled server can create modules its build does not yet import.
      const registry = parseRegistry(readFileSync(join(this.#sourceDir, "index.ts"), "utf8"));
      for (const number of registry.numbers) {
        if (this.#current.has(number)) continue;
        try {
          const parsed = parsePlaylist(readFileSync(this.sourcePath(number), "utf8"), number);
          if (parsed.name?.trim() && parsed.tracks.length) {
            this.publish(makeRevision({ number, name: parsed.name, tracks: parsed.tracks }));
          }
        } catch {
          // An incomplete external edit must not prevent existing stations playing.
        }
      }
    } catch {
      // Source-less installs retain the compiled registry.
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

  public create(change: PlaylistCreation, signal?: AbortSignal): Promise<PlaylistRevision> {
    const operation = this.#pending.then(async () => {
      try {
        return await this.applyCreation(change, signal);
      } catch (error) {
        if (error instanceof CatalogError) throw error;
        throw new CatalogError("The playlist could not be created. No playlists were added.");
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
    if (mirror) {
      mirror.name = canonical.name;
      mirror.tracks.splice(0, mirror.tracks.length, ...canonical.tracks);
    } else {
      this.#mirrors.push({ number: canonical.number, name: canonical.name, tracks: [...canonical.tracks] });
    }
    return canonical;
  }

  private async applyCreation(change: PlaylistCreation, signal?: AbortSignal): Promise<PlaylistRevision> {
    if (this.#needsRepair) throw new CatalogError("An operator must check the playlist files before more changes.");
    checkAbort(signal);
    const name = change.name.trim();
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new CatalogError("Choose a playlist name of 1 to 120 characters on one line.");
    }
    if (this.list().some((playlist) => playlist.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new CatalogError("A playlist with that name already exists. Choose it or use a different name.");
    }
    if (!change.filePath || !isAbsolute(change.filePath) || !change.filePath.toLowerCase().endsWith(".mp3")) {
      throw new CatalogError("Choose a downloaded MP3 song to start the playlist.");
    }
    if (!(await stat(change.filePath)).isFile()) throw new CatalogError("That downloaded song is unavailable.");
    const registryPath = join(this.#sourceDir, "index.ts");
    const originalRegistry = await readFile(registryPath, "utf8");
    const registry = parseRegistry(originalRegistry);
    if (registry.numbers.length !== this.#current.size || registry.numbers.some((number) => !this.#current.has(number))) {
      throw new CatalogError("The playlist registry was edited outside the agent. Reload the catalog before trying again.");
    }
    for (const playlist of this.list()) {
      const parsed = parsePlaylist(await readFile(this.sourcePath(playlist.number), "utf8"), playlist.number);
      if (!sameTracks(parsed.tracks, playlist.tracks) || (parsed.name !== undefined && parsed.name !== playlist.name)) {
        throw new CatalogError("A playlist was edited outside the agent. Reload the catalog before trying again.");
      }
    }
    const unavailable = new Set([...registry.importedNumbers, ...this.#current.keys(), ...(change.reservedNumbers ?? []), "99"]);
    for (const file of await readdir(this.#sourceDir)) {
      const number = file === "default.ts" ? "1" : /^playlist-([1-9]\d*)\.ts$/.exec(file)?.[1];
      if (number) unavailable.add(number);
    }
    let number = change.number;
    if (number !== undefined) {
      if (!/^[1-9]\d?$/.test(number) || Number(number) > 98) {
        throw new CatalogError("Choose a playlist number from 1 to 98. Number 99 is reserved for the agent.");
      }
      if (unavailable.has(number)) throw new CatalogError("That number is already used by a playlist or another dial destination.");
    } else {
      number = Array.from({ length: 98 }, (_, index) => String(index + 1)).find((candidate) => !unavailable.has(candidate));
      if (!number) throw new CatalogError("There are no available playlist numbers from 1 to 98.");
    }
    const next = makeRevision({ number, name, tracks: [change.filePath] });
    const newSource = `import type { Playlist } from "./index.js";\n\nconst playlist = {\n  number: ${JSON.stringify(number)},\n  name: ${JSON.stringify(name)},\n  tracks: [\n    ${JSON.stringify(change.filePath)},\n  ],\n} satisfies Playlist;\n\nexport default playlist;\n`;
    const updatedRegistry = registerPlaylist(originalRegistry, number);
    const changes: FileChange[] = [
      { path: this.sourcePath(number), before: null, after: newSource },
      { path: registryPath, before: originalRegistry, after: updatedRegistry },
      { path: this.#songListPath, before: await this.readOptional(this.#songListPath), after: songList([...this.list(), next]) },
    ];
    await this.writeTransaction(changes, signal);
    return this.publish(next);
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
    const nextSongList = songList(this.list().map((playlist) => nextByNumber.get(playlist.number) ?? playlist));
    const oldSongList = await this.readOptional(this.#songListPath);
    if (oldSongList !== nextSongList) fileChanges.push({ path: this.#songListPath, before: oldSongList, after: nextSongList });
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
