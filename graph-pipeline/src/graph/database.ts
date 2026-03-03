import Database from "better-sqlite3";
import type {
    SongKey,
    GraphNode,
    GraphEdge,
    ListeningGraph,
    GraphMetadata,
} from "./types.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
    song_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    artists TEXT NOT NULL,
    album_name TEXT,
    lastfm_url TEXT,
    track_id TEXT,
    total_plays INTEGER NOT NULL DEFAULT 0,
    page_rank REAL,
    cluster_id INTEGER,
    image_url TEXT,
    play_dates TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_key);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_key);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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

    /** Clear all graph data (nodes, edges, metadata) from the database. */
    clearGraph(): void {
        this.db.exec(
            "DELETE FROM edges; DELETE FROM nodes; DELETE FROM metadata;",
        );
    }

    /**
     * Save a ListeningGraph to the database.
     * Clears existing data and writes fresh — edges are individual timestamped events.
     */
    saveGraph(graph: ListeningGraph): void {
        const insertNode = this.db.prepare(`
            INSERT INTO nodes (song_key, name, artists, album_name, lastfm_url, track_id, total_plays, page_rank, cluster_id, image_url, play_dates)
            VALUES (@songKey, @name, @artists, @albumName, @lastfmUrl, @trackId, @totalPlays, @pageRank, @clusterId, @imageUrl, @playDates)
            ON CONFLICT(song_key) DO UPDATE SET
                name = COALESCE(excluded.name, nodes.name),
                artists = excluded.artists,
                album_name = COALESCE(excluded.album_name, nodes.album_name),
                lastfm_url = COALESCE(excluded.lastfm_url, nodes.lastfm_url),
                track_id = COALESCE(excluded.track_id, nodes.track_id),
                total_plays = excluded.total_plays,
                page_rank = COALESCE(excluded.page_rank, nodes.page_rank),
                cluster_id = COALESCE(excluded.cluster_id, nodes.cluster_id),
                image_url = COALESCE(excluded.image_url, nodes.image_url),
                play_dates = excluded.play_dates
        `);

        const insertEdge = this.db.prepare(`
            INSERT INTO edges (from_key, to_key, timestamp)
            VALUES (@fromKey, @toKey, @timestamp)
        `);

        const upsertMetadata = this.db.prepare(`
            INSERT INTO metadata (key, value) VALUES (@key, @value)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);

        const transaction = this.db.transaction(() => {
            // Insert nodes
            for (const [songKey, node] of Object.entries(graph.nodes)) {
                insertNode.run({
                    songKey,
                    name: node.name,
                    artists: JSON.stringify(node.artists),
                    albumName: node.albumName ?? null,
                    lastfmUrl: node.lastfmUrl ?? null,
                    trackId: node.trackId ?? null,
                    totalPlays: node.totalPlays,
                    pageRank: node.pageRank ?? null,
                    clusterId: node.clusterId ?? null,
                    imageUrl: node.imageUrl ?? null,
                    playDates: JSON.stringify(node.playDates),
                });
            }

            // Insert individual timestamped edges
            for (const edge of graph.edges) {
                insertEdge.run({
                    fromKey: edge.from,
                    toKey: edge.to,
                    timestamp: edge.timestamp,
                });
            }

            // Save metadata
            const meta = graph.metadata;
            upsertMetadata.run({
                key: "totalScrobbles",
                value: String(meta.totalScrobbles),
            });
            upsertMetadata.run({
                key: "dateRange",
                value: JSON.stringify(meta.dateRange),
            });
            upsertMetadata.run({
                key: "exportTimestamp",
                value: meta.exportTimestamp,
            });
            if (meta.lastfmUsername) {
                upsertMetadata.run({
                    key: "lastfmUsername",
                    value: meta.lastfmUsername,
                });
            }
        });

        transaction();
    }

    /** Load the full ListeningGraph from the database. */
    loadGraph(): ListeningGraph {
        const nodeRows = this.db
            .prepare("SELECT * FROM nodes")
            .all() as NodeRow[];
        const edgeRows = this.db
            .prepare("SELECT * FROM edges")
            .all() as EdgeRow[];

        const nodes: Record<SongKey, GraphNode> = {} as Record<
            SongKey,
            GraphNode
        >;

        // Build nodes
        for (const row of nodeRows) {
            const key = row.song_key as SongKey;
            nodes[key] = this.rowToNode(row);
        }

        // Build edges array
        const edges: GraphEdge[] = edgeRows.map((row) => ({
            from: row.from_key as SongKey,
            to: row.to_key as SongKey,
            timestamp: row.timestamp,
        }));

        // Derive node.next/node.previous from edges
        for (const edge of edges) {
            const fromKey = edge.from;
            const toKey = edge.to;
            if (nodes[fromKey]) {
                nodes[fromKey].next[toKey] =
                    (nodes[fromKey].next[toKey] ?? 0) + 1;
            }
            if (nodes[toKey]) {
                nodes[toKey].previous[fromKey] =
                    (nodes[toKey].previous[fromKey] ?? 0) + 1;
            }
        }

        // Load metadata
        const metaRows = this.db
            .prepare("SELECT * FROM metadata")
            .all() as MetadataRow[];
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

        return { nodes, edges, metadata };
    }

    /** Get a single node by its SongKey. */
    getNode(songKey: SongKey): GraphNode | null {
        const row = this.db
            .prepare("SELECT * FROM nodes WHERE song_key = ?")
            .get(songKey) as NodeRow | undefined;
        if (!row) return null;

        const outEdges = this.db
            .prepare(
                "SELECT to_key, COUNT(*) as weight FROM edges WHERE from_key = ? GROUP BY to_key",
            )
            .all(songKey) as { to_key: string; weight: number }[];
        const inEdges = this.db
            .prepare(
                "SELECT from_key, COUNT(*) as weight FROM edges WHERE to_key = ? GROUP BY from_key",
            )
            .all(songKey) as { from_key: string; weight: number }[];

        const next: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const e of outEdges) {
            next[e.to_key as SongKey] = e.weight;
        }

        const previous: Record<SongKey, number> = {} as Record<
            SongKey,
            number
        >;
        for (const e of inEdges) {
            previous[e.from_key as SongKey] = e.weight;
        }

        const node = this.rowToNode(row);
        node.next = next;
        node.previous = previous;
        return node;
    }

    /** Get the total number of nodes in the database. */
    getNodeCount(): number {
        const row = this.db
            .prepare("SELECT COUNT(*) as count FROM nodes")
            .get() as { count: number };
        return row.count;
    }

    /** Get the total number of edges in the database. */
    getEdgeCount(): number {
        const row = this.db
            .prepare("SELECT COUNT(*) as count FROM edges")
            .get() as { count: number };
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
            pageRank: row.page_rank ?? undefined,
            clusterId: row.cluster_id ?? undefined,
            imageUrl: row.image_url ?? undefined,
            playDates: row.play_dates ? JSON.parse(row.play_dates) : [],
        };
    }

    /** Close the database connection. */
    close(): void {
        this.db.close();
    }
}

/** Row shape from the nodes table. */
interface NodeRow {
    song_key: string;
    name: string;
    artists: string;
    album_name: string | null;
    lastfm_url: string | null;
    track_id: string | null;
    total_plays: number;
    page_rank: number | null;
    cluster_id: number | null;
    image_url: string | null;
    play_dates: string | null;
}

/** Row shape from the edges table. */
interface EdgeRow {
    id: number;
    from_key: string;
    to_key: string;
    timestamp: string;
}

/** Row shape from the metadata table. */
interface MetadataRow {
    key: string;
    value: string;
}
