import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
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
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nodes (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_key TEXT NOT NULL,
    mbid TEXT,
    name TEXT NOT NULL,
    artists JSONB NOT NULL,
    album_name TEXT,
    lastfm_url TEXT,
    track_id TEXT,
    total_plays INTEGER NOT NULL DEFAULT 0,
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    page_rank DOUBLE PRECISION,
    cluster_id INTEGER,
    image_url TEXT,
    source_plays JSONB,
    play_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
    positions JSONB,
    UNIQUE(user_id, song_key)
);

CREATE TABLE IF NOT EXISTS edges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    to_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    weight INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, from_id, to_id)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(user_id, from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(user_id, to_id);

CREATE TABLE IF NOT EXISTS metadata (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status_created_at
    ON pipeline_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_username_created_at_desc
    ON pipeline_jobs(username, created_at DESC);
`;

export class GraphDatabase {
    private readonly pool: Pool;
    private readonly initPromise: Promise<void>;

    constructor(databaseUrl: string) {
        this.pool = new Pool({
            connectionString: databaseUrl,
        });
        this.initPromise = this.initSchema();
    }

    private async initSchema(): Promise<void> {
        await this.pool.query(SCHEMA_SQL);
    }

    private async ready(): Promise<void> {
        await this.initPromise;
    }

    private async withTransaction<T>(
        fn: (client: PoolClient) => Promise<T>,
    ): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const result = await fn(client);
            await client.query("COMMIT");
            return result;
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    /** Get or create a user by username. Returns the user's id. */
    async getOrCreateUser(username: string): Promise<number> {
        await this.ready();
        const result = await this.pool.query<{ id: number }>(
            `INSERT INTO users (username)
             VALUES ($1)
             ON CONFLICT (username) DO UPDATE
             SET username = EXCLUDED.username
             RETURNING id`,
            [username],
        );
        return result.rows[0]!.id;
    }

    /** Get a user's id by username. Returns null if the user doesn't exist. */
    async getUserId(username: string): Promise<number | null> {
        await this.ready();
        const row = await this.pool.query<{ id: number }>(
            "SELECT id FROM users WHERE username = $1",
            [username],
        );
        return row.rows[0]?.id ?? null;
    }

    /** Return an active (queued/running) job for this user, if one exists.
     *  Running jobs older than 1 hour are treated as stale and ignored. */
    async getActiveJob(username: string): Promise<string | null> {
        await this.ready();
        const result = await this.pool.query<{ id: string }>(
            `SELECT id
             FROM pipeline_jobs
             WHERE username = $1
               AND status IN ('queued', 'running')
               AND NOT (status = 'running' AND started_at < now() - interval '1 hour')
             ORDER BY created_at DESC
             LIMIT 1`,
            [username],
        );
        return result.rows[0]?.id ?? null;
    }

    /** Queue a new pipeline job for a username and return its job id. */
    async enqueuePipelineJob(username: string): Promise<string> {
        await this.ready();
        const id = randomUUID();
        await this.pool.query(
            `INSERT INTO pipeline_jobs (id, username, status, created_at, updated_at)
             VALUES ($1, $2, 'queued', now(), now())`,
            [id, username],
        );
        return id;
    }

    /** Get a pipeline job by id for status polling. */
    async getPipelineJob(jobId: string): Promise<PipelineJobStatusRecord | null> {
        await this.ready();
        if (!isUuid(jobId)) {
            return null;
        }
        const result = await this.pool.query<PipelineJobRow>(
            `SELECT id, status, created_at, updated_at, started_at, finished_at
             FROM pipeline_jobs
             WHERE id = $1`,
            [jobId],
        );
        const row = result.rows[0];
        return row ? this.rowToPipelineJobStatus(row) : null;
    }

    /** List all pipeline jobs for a username, newest first. */
    async listPipelineJobs(username: string): Promise<PipelineJobStatusRecord[]> {
        await this.ready();
        const result = await this.pool.query<PipelineJobRow>(
            `SELECT id, status, created_at, updated_at, started_at, finished_at
             FROM pipeline_jobs
             WHERE username = $1
             ORDER BY created_at DESC, id DESC`,
            [username],
        );
        return result.rows.map((row) => this.rowToPipelineJobStatus(row));
    }

    /** Claim the oldest queued pipeline job and move it to running. */
    async claimNextQueuedPipelineJob(): Promise<PipelineJobClaim | null> {
        await this.ready();
        const result = await this.pool.query<PipelineJobClaimRow>(
            `WITH next_job AS (
                SELECT id, username
                FROM pipeline_jobs
                WHERE status = 'queued'
                ORDER BY created_at ASC, id ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE pipeline_jobs AS j
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                updated_at = now()
            FROM next_job
            WHERE j.id = next_job.id
            RETURNING next_job.id, next_job.username`,
        );
        const row = result.rows[0];
        return row ? { id: row.id, username: row.username } : null;
    }

    /** Mark a running job as succeeded and stamp completion time. */
    async markPipelineJobSucceeded(jobId: string): Promise<void> {
        await this.completePipelineJob(jobId, "succeeded");
    }

    /** Mark a running job as failed and stamp completion time. */
    async markPipelineJobFailed(jobId: string): Promise<void> {
        await this.completePipelineJob(jobId, "failed");
    }

    /** Mark a queued/running job as cancelled and stamp completion time. */
    async markPipelineJobCancelled(jobId: string): Promise<void> {
        await this.completePipelineJob(jobId, "cancelled");
    }

    /** Clear all graph data (nodes, edges, metadata) for a specific user. */
    async clearGraph(userId: number): Promise<void> {
        await this.ready();
        await this.withTransaction(async (client) => {
            await client.query("DELETE FROM edges WHERE user_id = $1", [userId]);
            await client.query("DELETE FROM nodes WHERE user_id = $1", [userId]);
            await client.query("DELETE FROM metadata WHERE user_id = $1", [userId]);
        });
    }

    /**
     * Save a ListeningGraph to the database for a specific user.
     * Supports incremental updates — merges edge weights and play counts
     * with any existing data.
     */
    async saveGraph(graph: ListeningGraph, userId: number): Promise<void> {
        await this.ready();

        await this.withTransaction(async (client) => {
            const songKeyToUuid = new Map<string, string>();

            for (const [songKey, node] of Object.entries(graph.nodes)) {
                const existingResult = await client.query<{
                    id: string;
                    sources: unknown;
                    source_plays: unknown | null;
                }>(
                    `SELECT id, sources, source_plays
                     FROM nodes
                     WHERE user_id = $1 AND song_key = $2`,
                    [userId, songKey],
                );
                const existingRow = existingResult.rows[0];

                const uuid = existingRow?.id ?? randomUUID();
                songKeyToUuid.set(songKey, uuid);

                const existingSources = toJsonArray<ListeningSource>(
                    existingRow?.sources,
                );
                const mergedSources = [
                    ...new Set([...existingSources, ...node.sources]),
                ];

                let mergedSourcePlays: Record<string, number> | null = null;
                if (node.sourcePlays || existingRow?.source_plays) {
                    const existing = toJsonRecordNumber(existingRow?.source_plays);
                    const incoming = node.sourcePlays ?? {};
                    mergedSourcePlays = { ...existing };
                    for (const [src, count] of Object.entries(incoming)) {
                        mergedSourcePlays[src] =
                            (mergedSourcePlays[src] ?? 0) + count;
                    }
                }

                await client.query(
                    `INSERT INTO nodes (
                        id, user_id, song_key, mbid, name, artists, album_name,
                        lastfm_url, track_id, total_plays, sources, page_rank,
                        cluster_id, image_url, source_plays, play_dates, positions
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7,
                        $8, $9, $10, $11, $12,
                        $13, $14, $15, $16, $17
                    )
                    ON CONFLICT(user_id, song_key) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, nodes.name),
                        artists = EXCLUDED.artists,
                        album_name = COALESCE(EXCLUDED.album_name, nodes.album_name),
                        lastfm_url = COALESCE(EXCLUDED.lastfm_url, nodes.lastfm_url),
                        mbid = COALESCE(EXCLUDED.mbid, nodes.mbid),
                        track_id = COALESCE(EXCLUDED.track_id, nodes.track_id),
                        total_plays = nodes.total_plays + EXCLUDED.total_plays,
                        sources = EXCLUDED.sources,
                        page_rank = COALESCE(EXCLUDED.page_rank, nodes.page_rank),
                        cluster_id = COALESCE(EXCLUDED.cluster_id, nodes.cluster_id),
                        image_url = COALESCE(EXCLUDED.image_url, nodes.image_url),
                        source_plays = COALESCE(EXCLUDED.source_plays, nodes.source_plays),
                        play_dates = EXCLUDED.play_dates,
                        positions = COALESCE(EXCLUDED.positions, nodes.positions)`,
                    [
                        uuid,
                        userId,
                        songKey,
                        node.mbid ?? null,
                        node.name,
                        JSON.stringify(node.artists),
                        node.albumName ?? null,
                        node.lastfmUrl ?? null,
                        node.trackId ?? null,
                        node.totalPlays,
                        JSON.stringify(mergedSources),
                        node.pageRank ?? null,
                        node.clusterId ?? null,
                        node.imageUrl ?? null,
                        mergedSourcePlays
                            ? JSON.stringify(mergedSourcePlays)
                            : null,
                        JSON.stringify(node.playDates),
                        node.positions ? JSON.stringify(node.positions) : null,
                    ],
                );
            }

            for (const [songKey, node] of Object.entries(graph.nodes)) {
                const fromId = songKeyToUuid.get(songKey);
                if (!fromId) continue;

                for (const [toKey, weight] of Object.entries(node.next)) {
                    const toId = songKeyToUuid.get(toKey);
                    if (!toId) continue;

                    await client.query(
                        `INSERT INTO edges (user_id, from_id, to_id, weight)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT(user_id, from_id, to_id) DO UPDATE SET
                         weight = edges.weight + EXCLUDED.weight`,
                        [userId, fromId, toId, weight],
                    );
                }
            }

            const meta = graph.metadata;
            await client.query(
                `INSERT INTO metadata (user_id, key, value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT(user_id, key) DO UPDATE SET value = EXCLUDED.value`,
                [userId, "totalScrobbles", String(meta.totalScrobbles)],
            );
            await client.query(
                `INSERT INTO metadata (user_id, key, value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT(user_id, key) DO UPDATE SET value = EXCLUDED.value`,
                [userId, "dateRange", JSON.stringify(meta.dateRange)],
            );
            await client.query(
                `INSERT INTO metadata (user_id, key, value)
                 VALUES ($1, $2, $3)
                 ON CONFLICT(user_id, key) DO UPDATE SET value = EXCLUDED.value`,
                [userId, "exportTimestamp", meta.exportTimestamp],
            );
            if (meta.lastfmUsername) {
                await client.query(
                    `INSERT INTO metadata (user_id, key, value)
                     VALUES ($1, $2, $3)
                     ON CONFLICT(user_id, key) DO UPDATE SET value = EXCLUDED.value`,
                    [userId, "lastfmUsername", meta.lastfmUsername],
                );
            }
        });
    }

    /** Load the full ListeningGraph from the database for a specific user (SongKey-based, for internal analysis). */
    async loadGraph(userId: number): Promise<ListeningGraph> {
        await this.ready();

        const [nodeResult, edgeResult] = await Promise.all([
            this.pool.query<NodeRow>("SELECT * FROM nodes WHERE user_id = $1", [userId]),
            this.pool.query<EdgeRow>("SELECT * FROM edges WHERE user_id = $1", [userId]),
        ]);

        const uuidToSongKey = new Map<string, SongKey>();
        const nodes: Record<SongKey, GraphNode> = {} as Record<SongKey, GraphNode>;

        for (const row of nodeResult.rows) {
            const key = row.song_key as SongKey;
            uuidToSongKey.set(row.id, key);
            nodes[key] = this.rowToNode(row);
        }

        for (const edge of edgeResult.rows) {
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

        const metadata = await this.loadMetadata(userId);
        return { nodes, metadata };
    }

    /** Load a compact graph for API responses (UUID-keyed nodes and edges). */
    async loadGraphCompact(userId: number): Promise<CompactGraph> {
        await this.ready();

        const [nodeResult, edgeResult] = await Promise.all([
            this.pool.query<NodeRow>("SELECT * FROM nodes WHERE user_id = $1", [userId]),
            this.pool.query<EdgeRow>("SELECT * FROM edges WHERE user_id = $1", [userId]),
        ]);

        const nodes: Record<string, CompactGraphNode> = {};

        for (const row of nodeResult.rows) {
            nodes[row.id] = this.rowToCompactNode(row);
        }

        for (const edge of edgeResult.rows) {
            if (nodes[edge.from_id]) {
                nodes[edge.from_id].next[edge.to_id] = edge.weight;
            }
            if (nodes[edge.to_id]) {
                nodes[edge.to_id].previous[edge.from_id] = edge.weight;
            }
        }

        const metadata = await this.loadMetadata(userId);
        return { nodes, metadata };
    }

    /** Get a single node by its SongKey for a specific user. */
    async getNode(songKey: SongKey, userId: number): Promise<GraphNode | null> {
        await this.ready();

        const nodeResult = await this.pool.query<NodeRow>(
            "SELECT * FROM nodes WHERE user_id = $1 AND song_key = $2",
            [userId, songKey],
        );
        const row = nodeResult.rows[0];
        if (!row) return null;

        const [outEdgesResult, inEdgesResult] = await Promise.all([
            this.pool.query<{ to_song_key: string; weight: number }>(
                `SELECT n.song_key AS to_song_key, e.weight
                 FROM edges e
                 JOIN nodes n
                 ON n.id = e.to_id AND n.user_id = e.user_id
                 WHERE e.user_id = $1 AND e.from_id = $2`,
                [userId, row.id],
            ),
            this.pool.query<{ from_song_key: string; weight: number }>(
                `SELECT n.song_key AS from_song_key, e.weight
                 FROM edges e
                 JOIN nodes n
                 ON n.id = e.from_id AND n.user_id = e.user_id
                 WHERE e.user_id = $1 AND e.to_id = $2`,
                [userId, row.id],
            ),
        ]);

        const next: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const edge of outEdgesResult.rows) {
            next[edge.to_song_key as SongKey] = edge.weight;
        }

        const previous: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const edge of inEdgesResult.rows) {
            previous[edge.from_song_key as SongKey] = edge.weight;
        }

        const node = this.rowToNode(row);
        node.next = next;
        node.previous = previous;
        return node;
    }

    /** Get a single node by its UUID, returning compact format for API. */
    async getNodeById(
        id: string,
        userId: number,
    ): Promise<(CompactGraphNode & { id: string }) | null> {
        await this.ready();
        if (!isUuid(id)) {
            return null;
        }

        const nodeResult = await this.pool.query<NodeRow>(
            "SELECT * FROM nodes WHERE id = $1 AND user_id = $2",
            [id, userId],
        );
        const row = nodeResult.rows[0];
        if (!row) return null;

        const [outEdgesResult, inEdgesResult] = await Promise.all([
            this.pool.query<Pick<EdgeRow, "to_id" | "weight">>(
                "SELECT to_id, weight FROM edges WHERE user_id = $1 AND from_id = $2",
                [userId, row.id],
            ),
            this.pool.query<Pick<EdgeRow, "from_id" | "weight">>(
                "SELECT from_id, weight FROM edges WHERE user_id = $1 AND to_id = $2",
                [userId, row.id],
            ),
        ]);

        const next: Record<string, number> = {};
        for (const edge of outEdgesResult.rows) {
            next[edge.to_id] = edge.weight;
        }

        const previous: Record<string, number> = {};
        for (const edge of inEdgesResult.rows) {
            previous[edge.from_id] = edge.weight;
        }

        const node = this.rowToCompactNode(row);
        node.next = next;
        node.previous = previous;
        return { id: row.id, ...node };
    }

    /** Get the total number of nodes in the database for a specific user. */
    async getNodeCount(userId: number): Promise<number> {
        await this.ready();
        const result = await this.pool.query<{ count: string }>(
            "SELECT COUNT(*) AS count FROM nodes WHERE user_id = $1",
            [userId],
        );
        return Number(result.rows[0]?.count ?? 0);
    }

    /** Get the total number of edges in the database for a specific user. */
    async getEdgeCount(userId: number): Promise<number> {
        await this.ready();
        const result = await this.pool.query<{ count: string }>(
            "SELECT COUNT(*) AS count FROM edges WHERE user_id = $1",
            [userId],
        );
        return Number(result.rows[0]?.count ?? 0);
    }

    /** Load metadata for a user. */
    private async loadMetadata(userId: number): Promise<GraphMetadata> {
        const result = await this.pool.query<MetadataRow>(
            "SELECT * FROM metadata WHERE user_id = $1",
            [userId],
        );
        const metaMap = new Map(result.rows.map((row) => [row.key, row.value]));

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
            createdAt: asTimestampString(row.created_at) ?? "",
            updatedAt: asTimestampString(row.updated_at) ?? "",
            startedAt: asTimestampString(row.started_at),
            finishedAt: asTimestampString(row.finished_at),
        };
    }

    /** Set terminal state + finished timestamp for a pipeline job. */
    private async completePipelineJob(
        jobId: string,
        status: Exclude<PipelineJobStatus, "queued" | "running">,
    ): Promise<void> {
        await this.ready();
        await this.pool.query(
            `UPDATE pipeline_jobs
             SET status = $1,
                 finished_at = now(),
                 updated_at = now()
             WHERE id = $2`,
            [status, jobId],
        );
    }

    /** Convert a database NodeRow into a GraphNode (without edges). */
    private rowToNode(row: NodeRow): GraphNode {
        return {
            name: row.name,
            artists: toJsonArray<string>(row.artists),
            albumName: row.album_name ?? undefined,
            lastfmUrl: row.lastfm_url ?? undefined,
            mbid: row.mbid ?? undefined,
            trackId: row.track_id
                ? (row.track_id as `track-${string}`)
                : undefined,
            next: {} as Record<SongKey, number>,
            previous: {} as Record<SongKey, number>,
            totalPlays: row.total_plays,
            sources: toJsonArray<ListeningSource>(row.sources),
            pageRank: row.page_rank ?? undefined,
            clusterId: row.cluster_id ?? undefined,
            imageUrl: row.image_url ?? undefined,
            sourcePlays: row.source_plays
                ? toJsonRecordNumber(row.source_plays)
                : undefined,
            playDates: toJsonArray<string>(row.play_dates),
            positions: row.positions
                ? (toJsonObject(row.positions) as GraphNode["positions"])
                : undefined,
        };
    }

    /** Convert a database NodeRow into a CompactGraphNode (without edges). */
    private rowToCompactNode(row: NodeRow): CompactGraphNode {
        return {
            songKey: row.song_key as SongKey,
            mbid: row.mbid ?? undefined,
            name: row.name,
            artists: toJsonArray<string>(row.artists),
            albumName: row.album_name ?? undefined,
            lastfmUrl: row.lastfm_url ?? undefined,
            imageUrl: row.image_url ?? undefined,
            next: {},
            previous: {},
            totalPlays: row.total_plays,
            sources: toJsonArray<ListeningSource>(row.sources),
            sourcePlays: row.source_plays
                ? toJsonRecordNumber(row.source_plays)
                : undefined,
            pageRank: row.page_rank ?? undefined,
            clusterId: row.cluster_id ?? undefined,
            playDates: toJsonArray<string>(row.play_dates),
            positions: row.positions
                ? (toJsonObject(row.positions) as CompactGraphNode["positions"])
                : undefined,
        };
    }

    /** Return per-node metrics for a given layout mode. */
    async getNodeMetrics(
        userId: number,
        layout: "pagerank" | "mds" | "weighted-mds",
    ): Promise<Record<string, number>> {
        await this.ready();

        let result: { rows: { id: string; metric: number }[] };

        if (layout === "pagerank") {
            result = await this.pool.query<{ id: string; metric: number }>(
                `SELECT id, COALESCE(page_rank, 0) AS metric
                 FROM nodes WHERE user_id = $1`,
                [userId],
            );
        } else if (layout === "mds") {
            result = await this.pool.query<{ id: string; metric: number }>(
                `SELECT n.id,
                        COUNT(DISTINCT e.to_id) + COUNT(DISTINCT e2.from_id) AS metric
                 FROM nodes n
                 LEFT JOIN edges e  ON e.from_id = n.id AND e.user_id = n.user_id
                 LEFT JOIN edges e2 ON e2.to_id  = n.id AND e2.user_id = n.user_id
                 WHERE n.user_id = $1
                 GROUP BY n.id`,
                [userId],
            );
        } else {
            // weighted-mds
            result = await this.pool.query<{ id: string; metric: number }>(
                `SELECT n.id,
                        COALESCE(SUM(e.weight), 0) AS metric
                 FROM nodes n
                 LEFT JOIN edges e ON (e.from_id = n.id OR e.to_id = n.id)
                                   AND e.user_id = n.user_id
                 WHERE n.user_id = $1
                 GROUP BY n.id`,
                [userId],
            );
        }

        const metrics: Record<string, number> = {};
        for (const row of result.rows) {
            metrics[row.id] = Number(row.metric);
        }
        return metrics;
    }

    /** Close the database connection pool. */
    async close(): Promise<void> {
        await this.pool.end();
    }
}

function toJsonArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
        return value as T[];
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? (parsed as T[]) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function toJsonObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
        } catch {
            return {};
        }
    }
    return {};
}

function toJsonRecordNumber(value: unknown): Record<string, number> {
    const raw = toJsonObject(value);
    const out: Record<string, number> = {};
    for (const [key, maybeNumber] of Object.entries(raw)) {
        if (typeof maybeNumber === "number") {
            out[key] = maybeNumber;
        }
    }
    return out;
}

function asTimestampString(value: Date | string | null): string | null {
    if (value === null) return null;
    if (typeof value === "string") return value;
    return value.toISOString();
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
    );
}

/** Row shape from the nodes table. */
interface NodeRow {
    id: string;
    user_id: number;
    song_key: string;
    mbid: string | null;
    name: string;
    artists: unknown;
    album_name: string | null;
    lastfm_url: string | null;
    track_id: string | null;
    total_plays: number;
    sources: unknown;
    page_rank: number | null;
    cluster_id: number | null;
    image_url: string | null;
    source_plays: unknown | null;
    play_dates: unknown;
    positions: unknown | null;
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
    created_at: Date | string;
    updated_at: Date | string;
    started_at: Date | string | null;
    finished_at: Date | string | null;
}

/** Row shape for claiming queued jobs. */
interface PipelineJobClaimRow {
    id: string;
    username: string;
}
