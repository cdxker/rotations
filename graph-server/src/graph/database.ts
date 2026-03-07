import Database from "better-sqlite3";
import type {
    SongKey,
    GraphNode,
    ListeningGraph,
    GraphMetadata,
    ListeningSource,
} from "./types.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodes (
    user_id INTEGER NOT NULL,
    song_key TEXT NOT NULL,
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
    PRIMARY KEY (user_id, song_key),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS edges (
    user_id INTEGER NOT NULL,
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, from_key, to_key),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(user_id, from_key);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(user_id, to_key);

CREATE TABLE IF NOT EXISTS metadata (
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
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
            INSERT INTO nodes (user_id, song_key, name, artists, album_name, lastfm_url, track_id, total_plays, sources, page_rank, cluster_id, image_url, source_plays, play_dates, positions)
            VALUES (@userId, @songKey, @name, @artists, @albumName, @lastfmUrl, @trackId, @totalPlays, @sources, @pageRank, @clusterId, @imageUrl, @sourcePlays, @playDates, @positions)
            ON CONFLICT(user_id, song_key) DO UPDATE SET
                name = COALESCE(excluded.name, nodes.name),
                artists = excluded.artists,
                album_name = COALESCE(excluded.album_name, nodes.album_name),
                lastfm_url = COALESCE(excluded.lastfm_url, nodes.lastfm_url),
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
            INSERT INTO edges (user_id, from_key, to_key, weight)
            VALUES (@userId, @fromKey, @toKey, @weight)
            ON CONFLICT(user_id, from_key, to_key) DO UPDATE SET
                weight = edges.weight + excluded.weight
        `);

        const upsertMetadata = this.db.prepare(`
            INSERT INTO metadata (user_id, key, value) VALUES (@userId, @key, @value)
            ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
        `);

        const transaction = this.db.transaction(() => {
            // Insert/update nodes
            for (const [songKey, node] of Object.entries(graph.nodes)) {
                // Merge sources and source_plays with existing
                const existingRow = this.db
                    .prepare(
                        "SELECT sources, source_plays FROM nodes WHERE user_id = ? AND song_key = ?",
                    )
                    .get(userId, songKey) as
                    | { sources: string; source_plays: string | null }
                    | undefined;
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
                    userId,
                    songKey,
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

            // Insert/update edges (next edges)
            for (const [songKey, node] of Object.entries(graph.nodes)) {
                for (const [toKey, weight] of Object.entries(node.next)) {
                    upsertEdge.run({
                        userId,
                        fromKey: songKey,
                        toKey,
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

    /** Load the full ListeningGraph from the database for a specific user. */
    loadGraph(userId: number): ListeningGraph {
        const nodeRows = this.db
            .prepare("SELECT * FROM nodes WHERE user_id = ?")
            .all(userId) as NodeRow[];
        const edgeRows = this.db
            .prepare("SELECT * FROM edges WHERE user_id = ?")
            .all(userId) as EdgeRow[];

        const nodes: Record<SongKey, GraphNode> = {} as Record<
            SongKey,
            GraphNode
        >;

        // Build nodes
        for (const row of nodeRows) {
            const key = row.song_key as SongKey;
            nodes[key] = this.rowToNode(row);
        }

        // Build edges
        for (const edge of edgeRows) {
            const fromKey = edge.from_key as SongKey;
            const toKey = edge.to_key as SongKey;
            if (nodes[fromKey]) {
                nodes[fromKey].next[toKey] = edge.weight;
            }
            if (nodes[toKey]) {
                nodes[toKey].previous[fromKey] = edge.weight;
            }
        }

        // Load metadata
        const metaRows = this.db
            .prepare("SELECT * FROM metadata WHERE user_id = ?")
            .all(userId) as MetadataRow[];
        const metaMap = new Map(metaRows.map((r) => [r.key, r.value]));

        const dateRange = metaMap.get("dateRange")
            ? JSON.parse(metaMap.get("dateRange")!)
            : { from: "", to: "" };

        const metadata: GraphMetadata = {
            totalScrobbles: Number(metaMap.get("totalScrobbles") ?? "0"),
            dateRange,
            exportTimestamp: metaMap.get("exportTimestamp") ?? "",
            lastfmUsername: metaMap.get("lastfmUsername"),
        };

        return { nodes, metadata };
    }

    /** Get a single node by its SongKey for a specific user. */
    getNode(songKey: SongKey, userId: number): GraphNode | null {
        const row = this.db
            .prepare("SELECT * FROM nodes WHERE user_id = ? AND song_key = ?")
            .get(userId, songKey) as NodeRow | undefined;
        if (!row) return null;

        const outEdges = this.db
            .prepare("SELECT to_key, weight FROM edges WHERE user_id = ? AND from_key = ?")
            .all(userId, songKey) as Pick<EdgeRow, "to_key" | "weight">[];
        const inEdges = this.db
            .prepare("SELECT from_key, weight FROM edges WHERE user_id = ? AND to_key = ?")
            .all(userId, songKey) as Pick<EdgeRow, "from_key" | "weight">[];

        const next: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const e of outEdges) {
            next[e.to_key as SongKey] = e.weight;
        }

        const previous: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const e of inEdges) {
            previous[e.from_key as SongKey] = e.weight;
        }

        const node = this.rowToNode(row);
        node.next = next;
        node.previous = previous;
        return node;
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

    /** Convert a database NodeRow into a GraphNode (without edges). */
    private rowToNode(row: NodeRow): GraphNode {
        return {
            name: row.name,
            artists: JSON.parse(row.artists),
            albumName: row.album_name ?? undefined,
            lastfmUrl: row.lastfm_url ?? undefined,
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

    /** Close the database connection. */
    close(): void {
        this.db.close();
    }
}

/** Row shape from the nodes table. */
interface NodeRow {
    user_id: number;
    song_key: string;
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
    from_key: string;
    to_key: string;
    weight: number;
}

/** Row shape from the metadata table. */
interface MetadataRow {
    user_id: number;
    key: string;
    value: string;
}
