/**
 * Frontend types for the listening graph API.
 *
 * These mirror the graph-pipeline types but are defined separately
 * to avoid a cross-project dependency.
 */

/** Canonical song identity: `lowercase(artist)::lowercase(track_name)`. */
export type SongKey = `${string}::${string}`;

/** Data source that contributed a scrobble or track ordering. */
export type ListeningSource = "lastfm" | "spotify-recent" | "spotify-playlist";

/** A node in the listening graph representing a single song. */
export interface GraphNode {
    name: string;
    artists: string[];
    albumName?: string;
    spotifyId?: string;
    lastfmUrl?: string;
    next: Record<SongKey, number>;
    previous: Record<SongKey, number>;
    totalPlays: number;
    sources: ListeningSource[];
    pageRank?: number;
    clusterId?: number;
}

/** Metadata about the graph export. */
export interface GraphMetadata {
    totalScrobbles: number;
    dateRange: { from: string; to: string };
    exportTimestamp: string;
    lastfmUsername?: string;
    spotifyUsername?: string;
}

/** The full listening graph as returned by GET /graph. */
export interface ListeningGraph {
    nodes: Record<SongKey, GraphNode>;
    metadata: GraphMetadata;
}

/** Filter criteria for the graph data layer. */
export interface GraphFilter {
    /** Minimum total plays to include a node. */
    minPlays?: number;
    /** Only include nodes from these sources. */
    sources?: ListeningSource[];
    /** Only include nodes in these cluster IDs. */
    clusterIds?: number[];
}
