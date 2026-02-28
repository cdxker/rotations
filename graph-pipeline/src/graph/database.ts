import Database from "better-sqlite3";
import type {
    SongKey,
    GraphNode,
    ListeningGraph,
    GraphMetadata,
    ListeningSource,
} from "./types.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
    song_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    artists TEXT NOT NULL,
    album_name TEXT,
    spotify_id TEXT,
    lastfm_url TEXT,
    track_id TEXT,
    total_plays INTEGER NOT NULL DEFAULT 0,
    sources TEXT NOT NULL DEFAULT '[]',
    page_rank REAL,
    cluster_id INTEGER,
    image_url TEXT
);

CREATE TABLE IF NOT EXISTS edges (
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (from_key, to_key)
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
        // Migration: add image_url column to existing databases
        try {
            this.db.exec(
                "ALTER TABLE nodes ADD COLUMN image_url TEXT",
            );
        } catch {
            // Column already exists — expected for new databases
        }
    }

    /**
     * Save a ListeningGraph to the database.
     * Supports incremental updates — merges edge weights and play counts
     * with any existing data.
     */
    saveGraph(graph: ListeningGraph): void {
        const upsertNode = this.db.prepare(`
            INSERT INTO nodes (song_key, name, artists, album_name, spotify_id, lastfm_url, track_id, total_plays, sources, page_rank, cluster_id, image_url)
            VALUES (@songKey, @name, @artists, @albumName, @spotifyId, @lastfmUrl, @trackId, @totalPlays, @sources, @pageRank, @clusterId, @imageUrl)
            ON CONFLICT(song_key) DO UPDATE SET
                name = COALESCE(excluded.name, nodes.name),
                artists = excluded.artists,
                album_name = COALESCE(excluded.album_name, nodes.album_name),
                spotify_id = COALESCE(excluded.spotify_id, nodes.spotify_id),
                lastfm_url = COALESCE(excluded.lastfm_url, nodes.lastfm_url),
                track_id = COALESCE(excluded.track_id, nodes.track_id),
                total_plays = nodes.total_plays + excluded.total_plays,
                sources = excluded.sources,
                page_rank = COALESCE(excluded.page_rank, nodes.page_rank),
                cluster_id = COALESCE(excluded.cluster_id, nodes.cluster_id),
                image_url = COALESCE(excluded.image_url, nodes.image_url)
        `);

        const upsertEdge = this.db.prepare(`
            INSERT INTO edges (from_key, to_key, weight)
            VALUES (@fromKey, @toKey, @weight)
            ON CONFLICT(from_key, to_key) DO UPDATE SET
                weight = edges.weight + excluded.weight
        `);

        const upsertMetadata = this.db.prepare(`
            INSERT INTO metadata (key, value) VALUES (@key, @value)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);

        const transaction = this.db.transaction(() => {
            // Insert/update nodes
            for (const [songKey, node] of Object.entries(graph.nodes)) {
                // Merge sources with existing
                const existingRow = this.db
                    .prepare("SELECT sources FROM nodes WHERE song_key = ?")
                    .get(songKey) as { sources: string } | undefined;
                const existingSources: ListeningSource[] = existingRow
                    ? JSON.parse(existingRow.sources)
                    : [];
                const mergedSources = [
                    ...new Set([...existingSources, ...node.sources]),
                ];

                upsertNode.run({
                    songKey,
                    name: node.name,
                    artists: JSON.stringify(node.artists),
                    albumName: node.albumName ?? null,
                    spotifyId: node.spotifyId ?? null,
                    lastfmUrl: node.lastfmUrl ?? null,
                    trackId: node.trackId ?? null,
                    totalPlays: node.totalPlays,
                    sources: JSON.stringify(mergedSources),
                    pageRank: node.pageRank ?? null,
                    clusterId: node.clusterId ?? null,
                    imageUrl: node.imageUrl ?? null,
                });
            }

            // Insert/update edges (next edges)
            for (const [songKey, node] of Object.entries(graph.nodes)) {
                for (const [toKey, weight] of Object.entries(node.next)) {
                    upsertEdge.run({
                        fromKey: songKey,
                        toKey,
                        weight,
                    });
                }
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
            if (meta.spotifyUsername) {
                upsertMetadata.run({
                    key: "spotifyUsername",
                    value: meta.spotifyUsername,
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
            nodes[key] = {
                name: row.name,
                artists: JSON.parse(row.artists),
                albumName: row.album_name ?? undefined,
                spotifyId: row.spotify_id ?? undefined,
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
            };
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
            spotifyUsername: metaMap.get("spotifyUsername"),
        };

        return { nodes, metadata };
    }

    /** Get a single node by its SongKey. */
    getNode(songKey: SongKey): GraphNode | null {
        const row = this.db
            .prepare("SELECT * FROM nodes WHERE song_key = ?")
            .get(songKey) as NodeRow | undefined;
        if (!row) return null;

        const outEdges = this.db
            .prepare("SELECT to_key, weight FROM edges WHERE from_key = ?")
            .all(songKey) as Pick<EdgeRow, "to_key" | "weight">[];
        const inEdges = this.db
            .prepare("SELECT from_key, weight FROM edges WHERE to_key = ?")
            .all(songKey) as Pick<EdgeRow, "from_key" | "weight">[];

        const next: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const e of outEdges) {
            next[e.to_key as SongKey] = e.weight;
        }

        const previous: Record<SongKey, number> = {} as Record<SongKey, number>;
        for (const e of inEdges) {
            previous[e.from_key as SongKey] = e.weight;
        }

        return {
            name: row.name,
            artists: JSON.parse(row.artists),
            albumName: row.album_name ?? undefined,
            spotifyId: row.spotify_id ?? undefined,
            lastfmUrl: row.lastfm_url ?? undefined,
            trackId: row.track_id
                ? (row.track_id as `track-${string}`)
                : undefined,
            next,
            previous,
            totalPlays: row.total_plays,
            sources: JSON.parse(row.sources),
            pageRank: row.page_rank ?? undefined,
            clusterId: row.cluster_id ?? undefined,
            imageUrl: row.image_url ?? undefined,
        };
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
    spotify_id: string | null;
    lastfm_url: string | null;
    track_id: string | null;
    total_plays: number;
    sources: string;
    page_rank: number | null;
    cluster_id: number | null;
    image_url: string | null;
}

/** Row shape from the edges table. */
interface EdgeRow {
    from_key: string;
    to_key: string;
    weight: number;
}

/** Row shape from the metadata table. */
interface MetadataRow {
    key: string;
    value: string;
}
