import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
    SongKey,
    GraphNode,
    ListeningGraph,
    GraphMetadata,
    ListeningSource,
    CompactGraphNode,
    CompactGraph,
} from "./types.js";

export type PipelineJobStatus =
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled";

export interface PipelineJobClaim {
    id: string;
    username: string;
}

export interface PipelineJobStatusRecord {
    id: string;
    status: PipelineJobStatus;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    song_key TEXT NOT NULL,
    mbid TEXT,
    name TEXT NOT NULL,
    artists TEXT NOT NULL,
    album_name TEXT,
    lastfm_url TEXT,
    track_id TEXT,
    total_plays INTEGER NOT NULL DEFAULT 0,
    sources TEXT NOT NULL DEFAULT '[]',
    page_rank REAL,
    cluster_id INTEGER,
    image_url TEXT,
    source_plays TEXT,
    play_dates TEXT NOT NULL DEFAULT '[]',
    positions TEXT,
    PRIMARY KEY (id),
    UNIQUE(user_id, song_key),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS edges (
    user_id INTEGER NOT NULL,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, from_id, to_id),
    FOREIGN KEY (from_id) REFERENCES nodes(id),
    FOREIGN KEY (to_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(user_id, from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(user_id, to_id);

CREATE TABLE IF NOT EXISTS metadata (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status_created_at
    ON pipeline_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_username_created_at_desc
    ON pipeline_jobs(username, created_at DESC);
`;

export class GraphDatabase {
    private db: Database.Database;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this.initSchema();
    }

    private initSchema(): void {
        this.db.exec(SCHEMA_SQL);
    }

    /** Get or create a user by username. Returns the user's id. */
    getOrCreateUser(username: string): number {
        const existing = this.db
            .prepare("SELECT id FROM users WHERE username = ?")
            .get(username) as { id: number } | undefined;
        if (existing) return existing.id;

        const result = this.db
            .prepare("INSERT INTO users (username) VALUES (?)")
            .run(username);
        return result.lastInsertRowid as number;
    }

    /** Get a user's id by username. Returns null if the user doesn't exist. */
    getUserId(username: string): number | null {
        const row = this.db
            .prepare("SELECT id FROM users WHERE username = ?")
            .get(username) as { id: number } | undefined;
        return row?.id ?? null;
    }

    /** Queue a new pipeline job for a username and return its job id. */
    enqueuePipelineJob(username: string): string {
        const id = randomUUID();
        this.db
            .prepare(
                `INSERT INTO pipeline_jobs (id, username, status, created_at, updated_at)
                 VALUES (?, ?, 'queued', datetime('now'), datetime('now'))`,
            )
            .run(id, username);
        return id;
    }

    /** Get a pipeline job by id for status polling. */
    getPipelineJob(jobId: string): PipelineJobStatusRecord | null {
        const row = this.db
            .prepare(
                `SELECT id, status, created_at, updated_at, started_at, finished_at
                 FROM pipeline_jobs
                 WHERE id = ?`,
            )
            .get(jobId) as PipelineJobRow | undefined;
        return row ? this.rowToPipelineJobStatus(row) : null;
    }

    /** List all pipeline jobs for a username, newest first. */
    listPipelineJobs(username: string): PipelineJobStatusRecord[] {
        const rows = this.db
            .prepare(
                `SELECT id, status, created_at, updated_at, started_at, finished_at
                 FROM pipeline_jobs
                 WHERE username = ?
                 ORDER BY created_at DESC, id DESC`,
            )
            .all(username) as PipelineJobRow[];
        return rows.map((row) => this.rowToPipelineJobStatus(row));
    }

    /** Claim the oldest queued pipeline job and move it to running. */
    claimNextQueuedPipelineJob(): PipelineJobClaim | null {
        const claim = this.db.transaction(() => {
            const row = this.db
                .prepare(
                    `SELECT id, username
                     FROM pipeline_jobs
                     WHERE status = 'queued'
                     ORDER BY created_at ASC, id ASC
                     LIMIT 1`,
                )
                .get() as PipelineJobClaimRow | undefined;

            if (!row) {
                return null;
            }

            const result = this.db
                .prepare(
                    `UPDATE pipeline_jobs
                     SET status = 'running',
                         started_at = COALESCE(started_at, datetime('now')),
                         updated_at = datetime('now')
                     WHERE id = ? AND status = 'queued'`,
                )
                .run(row.id);

            if (result.changes === 0) {
                return null;
            }

            return {
                id: row.id,
                username: row.username,
            };
        });

        return claim();
    }

    /** Mark a running job as succeeded and stamp completion time. */
    markPipelineJobSucceeded(jobId: string): void {
        this.completePipelineJob(jobId, "succeeded");
    }

    /** Mark a running job as failed and stamp completion time. */
    markPipelineJobFailed(jobId: string): void {
        this.completePipelineJob(jobId, "failed");
    }

    /** Mark a queued/running job as cancelled and stamp completion time. */
    markPipelineJobCancelled(jobId: string): void {
        this.completePipelineJob(jobId, "cancelled");
    }

    /** Clear all graph data (nodes, edges, metadata) for a specific user. */
    clearGraph(userId: number): void {
        this.db.exec(
            `DELETE FROM edges WHERE user_id = ${userId}; DELETE FROM nodes WHERE user_id = ${userId}; DELETE FROM metadata WHERE user_id = ${userId};`,
        );
    }

    /**
     * Save a ListeningGraph to the database for a specific user.
     * Supports incremental updates — merges edge weights and play counts
     * with any existing data.
     */
    saveGraph(graph: ListeningGraph, userId: number): void {
        const upsertNode = this.db.prepare(`
            INSERT INTO nodes (id, user_id, song_key, mbid, name, artists, album_name, lastfm_url, track_id, total_plays, sources, page_rank, cluster_id, image_url, source_plays, play_dates, positions)
            VALUES (@id, @userId, @songKey, @mbid, @name, @artists, @albumName, @lastfmUrl, @trackId, @totalPlays, @sources, @pageRank, @clusterId, @imageUrl, @sourcePlays, @playDates, @positions)
            ON CONFLICT(user_id, song_key) DO UPDATE SET
                name = COALESCE(excluded.name, nodes.name),
                artists = excluded.artists,
                album_name = COALESCE(excluded.album_name, nodes.album_name),
                lastfm_url = COALESCE(excluded.lastfm_url, nodes.lastfm_url),
                mbid = COALESCE(excluded.mbid, nodes.mbid),
                track_id = COALESCE(excluded.track_id, nodes.track_id),
                total_plays = nodes.total_plays + excluded.total_plays,
                sources = excluded.sources,
                page_rank = COALESCE(excluded.page_rank, nodes.page_rank),
                cluster_id = COALESCE(excluded.cluster_id, nodes.cluster_id),
                image_url = COALESCE(excluded.image_url, nodes.image_url),
                source_plays = COALESCE(excluded.source_plays, nodes.source_plays),
                play_dates = excluded.play_dates,
                positions = COALESCE(excluded.positions, nodes.positions)
        `);

        const upsertEdge = this.db.prepare(`
            INSERT INTO edges (user_id, from_id, to_id, weight)
            VALUES (@userId, @fromId, @toId, @weight)
            ON CONFLICT(user_id, from_id, to_id) DO UPDATE SET
                weight = edges.weight + excluded.weight
        `);

        const upsertMetadata = this.db.prepare(`
            INSERT INTO metadata (user_id, key, value) VALUES (@userId, @key, @value)
            ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
        `);

        const transaction = this.db.transaction(() => {
            // Build songKey → UUID map (reuse existing UUIDs for existing nodes)
            const songKeyToUuid = new Map<string, string>();

            // Insert/update nodes
            for (const [songKey, node] of Object.entries(graph.nodes)) {
                // Check for existing node to reuse its UUID
                const existingRow = this.db
                    .prepare(
                        "SELECT id, sources, source_plays FROM nodes WHERE user_id = ? AND song_key = ?",
                    )
                    .get(userId, songKey) as
                    | { id: string; sources: string; source_plays: string | null }
                    | undefined;

                const uuid = existingRow?.id ?? randomUUID();
                songKeyToUuid.set(songKey, uuid);

                const existingSources: ListeningSource[] = existingRow
                    ? JSON.parse(existingRow.sources)
                    : [];
                const mergedSources = [
                    ...new Set([...existingSources, ...node.sources]),
                ];

                // Merge source_plays additively per source key
                let mergedSourcePlays: Record<string, number> | null = null;
                if (node.sourcePlays || existingRow?.source_plays) {
                    const existing: Record<string, number> =
                        existingRow?.source_plays
                            ? JSON.parse(existingRow.source_plays)
                            : {};
                    const incoming: Record<string, number> =
                        node.sourcePlays ?? {};
                    mergedSourcePlays = { ...existing };
                    for (const [src, count] of Object.entries(incoming)) {
                        mergedSourcePlays[src] =
                            (mergedSourcePlays[src] ?? 0) + count;
                    }
                }

                upsertNode.run({
                    id: uuid,
                    userId,
                    songKey,
                    mbid: node.mbid ?? null,
                    name: node.name,
                    artists: JSON.stringify(node.artists),
                    albumName: node.albumName ?? null,
                    lastfmUrl: node.lastfmUrl ?? null,
                    trackId: node.trackId ?? null,
                    totalPlays: node.totalPlays,
                    sources: JSON.stringify(mergedSources),
                    pageRank: node.pageRank ?? null,
                    clusterId: node.clusterId ?? null,
                    imageUrl: node.imageUrl ?? null,
                    sourcePlays: mergedSourcePlays
                        ? JSON.stringify(mergedSourcePlays)
                        : null,
                    playDates: JSON.stringify(node.playDates),
                    positions: node.positions
                        ? JSON.stringify(node.positions)
                        : null,
                });
            }

            // Insert/update edges using UUIDs
            for (const [songKey, node] of Object.entries(graph.nodes)) {
                const fromId = songKeyToUuid.get(songKey);
                if (!fromId) continue;
                for (const [toKey, weight] of Object.entries(node.next)) {
                    const toId = songKeyToUuid.get(toKey);
                    if (!toId) continue;
                    upsertEdge.run({
                        userId,
                        fromId,
                        toId,
                        weight,
                    });
                }
            }

            // Save metadata
            const meta = graph.metadata;
            upsertMetadata.run({
                userId,
                key: "totalScrobbles",
                value: String(meta.totalScrobbles),
            });
            upsertMetadata.run({
                userId,
                key: "dateRange",
                value: JSON.stringify(meta.dateRange),
            });
            upsertMetadata.run({
                userId,
                key: "exportTimestamp",
                value: meta.exportTimestamp,
            });
            if (meta.lastfmUsername) {
                upsertMetadata.run({
                    userId,
                    key: "lastfmUsername",
                    value: meta.lastfmUsername,
                });
            }
        });

        transaction();
    }

    /** Load the full ListeningGraph from the database for a specific user (SongKey-based, for internal analysis). */
    loadGraph(userId: number): ListeningGraph {
        const nodeRows = this.db
            .prepare("SELECT * FROM nodes WHERE user_id = ?")
            .all(userId) as NodeRow[];
        const edgeRows = this.db
            .prepare("SELECT * FROM edges WHERE user_id = ?")
            .all(userId) as EdgeRow[];

        // Build uuid → songKey map
        const uuidToSongKey = new Map<string, SongKey>();
        const nodes: Record<SongKey, GraphNode> = {} as Record<
            SongKey,
            GraphNode
        >;

        for (const row of nodeRows) {
            const key = row.song_key as SongKey;
            uuidToSongKey.set(row.id, key);
            nodes[key] = this.rowToNode(row);
        }

        // Build edges (translate UUIDs to SongKeys)
        for (const edge of edgeRows) {
            const fromKey = uuidToSongKey.get(edge.from_id);
            const toKey = uuidToSongKey.get(edge.to_id);
            if (!fromKey || !toKey) continue;
            if (nodes[fromKey]) {
                nodes[fromKey].next[toKey] = edge.weight;
            }
            if (nodes[toKey]) {
                nodes[toKey].previous[fromKey] = edge.weight;
            }
        }

        const metadata = this.loadMetadata(userId);
        return { nodes, metadata };
    }

    /** Load a compact graph for API responses (UUID-keyed nodes and edges). */
    loadGraphCompact(userId: number): CompactGraph {
        const nodeRows = this.db
            .prepare("SELECT * FROM nodes WHERE user_id = ?")
            .all(userId) as NodeRow[];
        const edgeRows = this.db
            .prepare("SELECT * FROM edges WHERE user_id = ?")
            .all(userId) as EdgeRow[];

        const nodes: Record<string, CompactGraphNode> = {};

        for (const row of nodeRows) {
            nodes[row.id] = this.rowToCompactNode(row);
        }

        // Build edges using UUIDs directly
        for (const edge of edgeRows) {
            if (nodes[edge.from_id]) {
                nodes[edge.from_id].next[edge.to_id] = edge.weight;
            }
            if (nodes[edge.to_id]) {
                nodes[edge.to_id].previous[edge.from_id] = edge.weight;
            }
        }

        const metadata = this.loadMetadata(userId);
        return { nodes, metadata };
    }

    /** Get a single node by its SongKey for a specific user. */
    getNode(songKey: SongKey, userId: number): GraphNode | null {
        const row = this.db
            .prepare("SELECT * FROM nodes WHERE user_id = ? AND song_key = ?")
            .get(userId, songKey) as NodeRow | undefined;
        if (!row) return null;

        const outEdges = this.db
            .prepare("SELECT to_id, weight FROM edges WHERE user_id = ? AND from_id = ?")
            .all(userId, row.id) as Pick<EdgeRow, "to_id" | "weight">[];
        const inEdges = this.db
            .prepare("SELECT from_id, weight FROM edges WHERE user_id = ? AND to_id = ?")
            .all(userId, row.id) as Pick<EdgeRow, "from_id" | "weight">[];

        // Translate UUIDs to SongKeys
        const next: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const e of outEdges) {
            const sk = this.uuidToSongKey(e.to_id, userId);
            if (sk) next[sk] = e.weight;
        }

        const previous: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const e of inEdges) {
            const sk = this.uuidToSongKey(e.from_id, userId);
            if (sk) previous[sk] = e.weight;
        }

        const node = this.rowToNode(row);
        node.next = next;
        node.previous = previous;
        return node;
    }

    /** Get a single node by its UUID, returning compact format for API. */
    getNodeById(id: string, userId: number): (CompactGraphNode & { id: string }) | null {
        const row = this.db
            .prepare("SELECT * FROM nodes WHERE id = ? AND user_id = ?")
            .get(id, userId) as NodeRow | undefined;
        if (!row) return null;

        const outEdges = this.db
            .prepare("SELECT to_id, weight FROM edges WHERE user_id = ? AND from_id = ?")
            .all(userId, row.id) as Pick<EdgeRow, "to_id" | "weight">[];
        const inEdges = this.db
            .prepare("SELECT from_id, weight FROM edges WHERE user_id = ? AND to_id = ?")
            .all(userId, row.id) as Pick<EdgeRow, "from_id" | "weight">[];

        const next: Record<string, number> = {};
        for (const e of outEdges) {
            next[e.to_id] = e.weight;
        }

        const previous: Record<string, number> = {};
        for (const e of inEdges) {
            previous[e.from_id] = e.weight;
        }

        const node = this.rowToCompactNode(row);
        node.next = next;
        node.previous = previous;
        return { id: row.id, ...node };
    }

    /** Get the total number of nodes in the database for a specific user. */
    getNodeCount(userId: number): number {
        const row = this.db
            .prepare("SELECT COUNT(*) as count FROM nodes WHERE user_id = ?")
            .get(userId) as { count: number };
        return row.count;
    }

    /** Get the total number of edges in the database for a specific user. */
    getEdgeCount(userId: number): number {
        const row = this.db
            .prepare("SELECT COUNT(*) as count FROM edges WHERE user_id = ?")
            .get(userId) as { count: number };
        return row.count;
    }

    /** Translate a UUID to a SongKey. */
    private uuidToSongKey(uuid: string, userId: number): SongKey | null {
        const row = this.db
            .prepare("SELECT song_key FROM nodes WHERE id = ? AND user_id = ?")
            .get(uuid, userId) as { song_key: string } | undefined;
        return row ? (row.song_key as SongKey) : null;
    }

    /** Load metadata for a user. */
    private loadMetadata(userId: number): GraphMetadata {
        const metaRows = this.db
            .prepare("SELECT * FROM metadata WHERE user_id = ?")
            .all(userId) as MetadataRow[];
        const metaMap = new Map(metaRows.map((r) => [r.key, r.value]));

        const dateRange = metaMap.get("dateRange")
            ? JSON.parse(metaMap.get("dateRange")!)
            : { from: "", to: "" };

        return {
            totalScrobbles: Number(metaMap.get("totalScrobbles") ?? "0"),
            dateRange,
            exportTimestamp: metaMap.get("exportTimestamp") ?? "",
            lastfmUsername: metaMap.get("lastfmUsername"),
        };
    }

    /** Convert a pipeline job row into API-facing status shape. */
    private rowToPipelineJobStatus(
        row: PipelineJobRow,
    ): PipelineJobStatusRecord {
        return {
            id: row.id,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
        };
    }

    /** Set terminal state + finished timestamp for a pipeline job. */
    private completePipelineJob(
        jobId: string,
        status: Exclude<PipelineJobStatus, "queued" | "running">,
    ): void {
        this.db
            .prepare(
                `UPDATE pipeline_jobs
                 SET status = ?,
                     finished_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?`,
            )
            .run(status, jobId);
    }

    /** Convert a database NodeRow into a GraphNode (without edges). */
    private rowToNode(row: NodeRow): GraphNode {
        return {
            name: row.name,
            artists: JSON.parse(row.artists),
            albumName: row.album_name ?? undefined,
            lastfmUrl: row.lastfm_url ?? undefined,
            mbid: row.mbid ?? undefined,
            trackId: row.track_id
                ? (row.track_id as `track-${string}`)
                : undefined,
            next: {} as Record<SongKey, number>,
            previous: {} as Record<SongKey, number>,
            totalPlays: row.total_plays,
            sources: JSON.parse(row.sources),
            pageRank: row.page_rank ?? undefined,
            clusterId: row.cluster_id ?? undefined,
            imageUrl: row.image_url ?? undefined,
            sourcePlays: row.source_plays
                ? JSON.parse(row.source_plays)
                : undefined,
            playDates: row.play_dates ? JSON.parse(row.play_dates) : [],
            positions: row.positions
                ? JSON.parse(row.positions)
                : undefined,
        };
    }

    /** Convert a database NodeRow into a CompactGraphNode (without edges). */
    private rowToCompactNode(row: NodeRow): CompactGraphNode {
        return {
            songKey: row.song_key as SongKey,
            mbid: row.mbid ?? undefined,
            name: row.name,
            artists: JSON.parse(row.artists),
            albumName: row.album_name ?? undefined,
            lastfmUrl: row.lastfm_url ?? undefined,
            imageUrl: row.image_url ?? undefined,
            next: {},
            previous: {},
            totalPlays: row.total_plays,
            sources: JSON.parse(row.sources),
            sourcePlays: row.source_plays
                ? JSON.parse(row.source_plays)
                : undefined,
            pageRank: row.page_rank ?? undefined,
            clusterId: row.cluster_id ?? undefined,
            playDates: row.play_dates ? JSON.parse(row.play_dates) : [],
            positions: row.positions
                ? JSON.parse(row.positions)
                : undefined,
        };
    }

    /** Close the database connection. */
    close(): void {
        this.db.close();
    }
}

/** Row shape from the nodes table. */
interface NodeRow {
    id: string;
    user_id: number;
    song_key: string;
    mbid: string | null;
    name: string;
    artists: string;
    album_name: string | null;
    lastfm_url: string | null;
    track_id: string | null;
    total_plays: number;
    sources: string;
    page_rank: number | null;
    cluster_id: number | null;
    image_url: string | null;
    source_plays: string | null;
    play_dates: string | null;
    positions: string | null;
}

/** Row shape from the edges table. */
interface EdgeRow {
    user_id: number;
    from_id: string;
    to_id: string;
    weight: number;
}

/** Row shape from the metadata table. */
interface MetadataRow {
    user_id: number;
    key: string;
    value: string;
}

/** Row shape for pipeline_jobs status queries. */
interface PipelineJobRow {
    id: string;
    status: PipelineJobStatus;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    finished_at: string | null;
}

/** Row shape for claiming queued jobs. */
interface PipelineJobClaimRow {
    id: string;
    username: string;
}
