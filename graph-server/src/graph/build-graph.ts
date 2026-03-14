import {
    type SongKey,
    type GraphNode,
    type ListeningGraph,
    type ListeningSource,
    toSongKey,
} from "./types.js";

const ONE_HOUR_IN_SESCONDS = 60 * 60;

something shere

/** A single scrobble from Last.fm's user.getRecentTracks API. */
export interface RawScrobble {
    artist: string;
    track: string;
    album: string;
    /** Unix timestamp (seconds) of when the track was scrobbled. */
    timestamp: number;
    /** Album artwork URL from Last.fm, if available. */
    imageUrl?: string;
    /** MusicBrainz ID from Last.fm, if available. */
    mbid?: string;
}

/** Input data for the graph builder. */
export interface GraphInput {
    lastfmScrobbles?: RawScrobble[];
    lastfmUsername?: string;
}

function getOrCreateNode(
    nodes: Record<SongKey, GraphNode>,
    key: SongKey,
    name: string,
    artist: string,
    album: string,
    imageUrl?: string,
    mbid?: string,
): GraphNode {
    let node = nodes[key];
    if (!node) {
        node = {
            name,
            artists: [artist],
            albumName: album || undefined,
            next: {} as Record<SongKey, number>,
            previous: {} as Record<SongKey, number>,
            totalPlays: 0,
            sources: [],
            playDates: [],
        };
        nodes[key] = node;
    }
    // Keep first non-empty image URL encountered
    if (imageUrl && !node.imageUrl) {
        node.imageUrl = imageUrl;
    }
    // Keep first non-empty mbid encountered
    if (mbid && !node.mbid) {
        node.mbid = mbid;
    }
    return node;
}

function addSource(node: GraphNode, source: ListeningSource): void {
    if (!node.sources.includes(source)) {
        node.sources.push(source);
    }
    node.sourcePlays ??= {};
    node.sourcePlays[source] = (node.sourcePlays[source] ?? 0) + 1;
}

function addEdge(
    nodes: Record<SongKey, GraphNode>,
    fromKey: SongKey,
    toKey: SongKey,
): void {
    const fromNode = nodes[fromKey];
    const toNode = nodes[toKey];
    if (!fromNode || !toNode) return;

    fromNode.next[toKey] = (fromNode.next[toKey] ?? 0) + 1;
    toNode.previous[fromKey] = (toNode.previous[fromKey] ?? 0) + 1;
}

function isValidTrack(artist: string, track: string): boolean {
    return artist.trim().length > 0 && track.trim().length > 0;
}

function processLastfmScrobbles(
    nodes: Record<SongKey, GraphNode>,
    scrobbles: RawScrobble[],
): { totalPlays: number; timestamps: number[] } {
    // Sort chronologically
    const sorted = [...scrobbles].sort((a, b) => a.timestamp - b.timestamp);
    const timestamps: number[] = [];
    const keys: SongKey[] = [];

    for (const scrobble of sorted) {
        if (!isValidTrack(scrobble.artist, scrobble.track)) continue;

        const key = toSongKey(scrobble.artist, scrobble.track);
        const node = getOrCreateNode(
            nodes,
            key,
            scrobble.track,
            scrobble.artist,
            scrobble.album,
            scrobble.imageUrl,
            scrobble.mbid,
        );
        node.totalPlays++;
        node.playDates.push(new Date(scrobble.timestamp * 1000).toISOString());
        addSource(node, "lastfm");
        keys.push(key);
        timestamps.push(scrobble.timestamp);
    }

    for (let i = 0; i < keys.length - 1; i++) {
        if (timestamps[i + 1]! - timestamps[i]! <= ONE_HOUR_IN_SESCONDS) {
            addEdge(nodes, keys[i]!, keys[i + 1]!);

            da
        }
    }

    return { totalPlays: keys.length, timestamps };
}

/**
 * Build a unified ListeningGraph from raw data sources.
 * Accepts Last.fm scrobbles.
 */
export function buildGraph(input: GraphInput): ListeningGraph {
    const nodes: Record<SongKey, GraphNode> = {} as Record<SongKey, GraphNode>;
    const allTimestamps: number[] = [];
    let totalScrobbles = 0;

    if (input.lastfmScrobbles?.length) {
        const result = processLastfmScrobbles(nodes, input.lastfmScrobbles);
        totalScrobbles += result.totalPlays;
        for (const t of result.timestamps) allTimestamps.push(t);
    }

    // Compute date range from timestamps (loop to avoid stack overflow on large arrays)
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const t of allTimestamps) {
        if (t < minTs) minTs = t;
        if (t > maxTs) maxTs = t;
    }
    const from =
        allTimestamps.length > 0 ? new Date(minTs * 1000).toISOString() : "";
    const to =
        allTimestamps.length > 0 ? new Date(maxTs * 1000).toISOString() : "";

    // Sort each node's playDates chronologically
    for (const node of Object.values(nodes)) {
        node.playDates.sort();
    }

    return {
        nodes,
        metadata: {
            totalScrobbles,
            dateRange: { from, to },
            exportTimestamp: new Date().toISOString(),
            lastfmUsername: input.lastfmUsername,
        },
    };
}
