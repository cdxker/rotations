/**
 * Core types for the Listening History Graph.
 *
 * Relationship between identifiers:
 *
 * - `SongKey` is the canonical identity used in the graph: `lowercase(artist)::lowercase(track)`.
 *   It enables cross-source matching — the same song from Last.fm and Spotify resolves to the
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

/** Data source that contributed a scrobble or track ordering. */
export type ListeningSource = "lastfm" | "spotify-recent" | "spotify-playlist";

/** A node in the listening graph representing a single song. */
export interface GraphNode {
    /** Display name of the track. */
    name: string;

    /** Artist name(s). */
    artists: string[];

    /** Album name, if known. */
    albumName?: string;

    /** Spotify track ID, if available. */
    spotifyId?: string;

    /** Last.fm track URL, if available. */
    lastfmUrl?: string;

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

    /** Total number of plays across all sources. */
    totalPlays: number;

    /** Which data sources contributed plays for this song. */
    sources: ListeningSource[];

    /** PageRank score, populated by the analysis phase. */
    pageRank?: number;

    /** Cluster ID, populated by community detection in the analysis phase. */
    clusterId?: number;

    /** Album/track artwork URL, if available from Spotify or Last.fm. */
    imageUrl?: string;
}

/** Metadata about the graph export. */
export interface GraphMetadata {
    /** Total number of scrobbles / play events ingested. */
    totalScrobbles: number;

    /** Date range of the listening history. */
    dateRange: {
        from: string;
        to: string;
    };

    /** ISO timestamp of when the graph was exported. */
    exportTimestamp: string;

    /** Last.fm username, if Last.fm data was ingested. */
    lastfmUsername?: string;

    /** Spotify display name, if Spotify data was ingested. */
    spotifyUsername?: string;
}

/** The full listening graph: all nodes + metadata. */
export interface ListeningGraph {
    nodes: Record<SongKey, GraphNode>;
    metadata: GraphMetadata;
}

/**
 * Create a canonical SongKey from artist and track name.
 * Lowercases and trims both inputs for consistent cross-source matching.
 */
export function toSongKey(artist: string, track: string): SongKey {
    return `${artist.toLowerCase().trim()}::${track.toLowerCase().trim()}`;
}
