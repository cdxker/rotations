/**
 * Core types for the Listening History Graph.
 *
 * Relationship between identifiers:
 *
 * - `SongKey` is the canonical identity used in the graph: `lowercase(artist)::lowercase(track)`.
 *   It enables cross-source matching — the same song resolves to the
 *   same key regardless of minor formatting differences.
 *
 * - `TrackId` (from site/src/shared/types.ts) is a branded string (`track-${string}`) used by
 *   the local music library / playlist player. A GraphNode may optionally link back to a TrackId
 *   if the song also exists in the local library.
 *
 * - `FuckingTrack` (from site/) has a `next_tracks` field that maps PlaylistId → next TrackId
 *   within a single playlist. `GraphNode.next` generalizes this: it aggregates **all** sequential
 *   transitions across every source into weighted edges keyed by SongKey.
 */

/**
 * Canonical song identity: `lowercase(artist)::lowercase(track_name)`.
 * Used to match the same song across data sources.
 */
export type SongKey = `${string}::${string}`;

/**
 * TrackId from the local library (site/src/shared/types.ts).
 * Duplicated here to avoid a cross-project dependency — keep in sync.
 */
export type TrackId = `track-${string}`;

export type ListeningSource = "lastfm";

/** Layout mode for node positioning. */
export type LayoutMode = "pagerank" | "mds" | "weighted-mds";

/** Pre-computed x/y positions keyed by layout mode. */
export type LayoutPositions = Partial<Record<LayoutMode, { x: number; y: number }>>;

/** A node in the listening graph representing a single song. */
export interface GraphNode {
    name: string;
    artists: string[];
    albumName?: string;
    lastfmUrl?: string;

    /** MusicBrainz ID from Last.fm, if available. */
    mbid?: string;

    /**
     * Link back to the local library's TrackId, if this song exists there.
     * See module-level docs for the relationship between SongKey and TrackId.
     */
    trackId?: TrackId;

    /**
     * Weighted outgoing edges: SongKey → count of transitions from this song to that song.
     * If this song was followed by song B three times, `next[keyB] = 3`.
     */
    next: Record<SongKey, number>;

    /**
     * Weighted incoming edges: SongKey → count of transitions from that song to this song.
     * Mirror of the source node's `next` entry: `nodeB.previous[keyA] = nodeA.next[keyB]`.
     */
    previous: Record<SongKey, number>;

    totalPlays: number;
    sources: ListeningSource[];
    sourcePlays?: Partial<Record<ListeningSource, number>>;
    pageRank?: number;
    clusterId?: number;
    imageUrl?: string;
    /** ISO 8601 timestamps of every play across all sources, chronologically sorted. */
    playDates: string[];
    /** Pre-computed layout positions for each layout mode. */
    positions?: LayoutPositions;
}

/** Per-node metric scores — only the field matching the requested layout is populated. */
export interface NodeMetrics {
    pageRank?: number;
    mdsScore?: number;
    weightedMdsScore?: number;
}

export interface GraphMetadata {
    totalScrobbles: number;
    dateRange: { from: string; to: string };
    exportTimestamp: string;
    lastfmUsername?: string;
}

/** The full listening graph: all nodes + metadata. */
export interface ListeningGraph {
    nodes: Record<SongKey, GraphNode>;
    metadata: GraphMetadata;
}

/** A compact node for API responses — uses UUIDs for next/prev references. */
export interface CompactGraphNode {
    songKey: SongKey;
    mbid?: string;
    name: string;
    artists: string[];
    albumName?: string;
    lastfmUrl?: string;
    imageUrl?: string;
    next: Record<string, number>;
    previous: Record<string, number>;
    totalPlays: number;
    sources: ListeningSource[];
    sourcePlays?: Partial<Record<ListeningSource, number>>;
    pageRank?: number;
    clusterId?: number;
    playDates: string[];
    positions?: LayoutPositions;
}

/** Compact graph for API responses — UUID-keyed nodes. */
export interface CompactGraph {
    nodes: Record<string, CompactGraphNode>;
    metadata: GraphMetadata;
}

/**
 * Create a canonical SongKey from artist and track name.
 * Lowercases and trims both inputs for consistent cross-source matching.
 */
export function toSongKey(artist: string, track: string): SongKey {
    return `${artist.toLowerCase().trim()}::${track.toLowerCase().trim()}`;
}
