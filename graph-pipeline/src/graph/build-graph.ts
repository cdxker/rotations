import {
    type SongKey,
    type GraphNode,
    type GraphEdge,
    type ListeningGraph,
    toSongKey,
} from "./types.js";

const ONE_HOUR_IN_SESCONDS = 60 * 60;

/** A single scrobble from Last.fm's user.getRecentTracks API. */
export interface RawScrobble {
    artist: string;
    track: string;
    album: string;
    /** Unix timestamp (seconds) of when the track was scrobbled. */
    timestamp: number;
    /** Album artwork URL from Last.fm, if available. */
    imageUrl?: string;
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
            playDates: [],
        };
        nodes[key] = node;
    }
    // Keep first non-empty image URL encountered
    if (imageUrl && !node.imageUrl) {
        node.imageUrl = imageUrl;
    }
    return node;
}

function isValidTrack(artist: string, track: string): boolean {
    return artist.trim().length > 0 && track.trim().length > 0;
}

/**
 * Derive node.next and node.previous aggregate maps from the edges array.
 */
function deriveAggregates(
    nodes: Record<SongKey, GraphNode>,
    edges: GraphEdge[],
): void {
    // Reset all aggregates
    for (const node of Object.values(nodes)) {
        node.next = {} as Record<SongKey, number>;
        node.previous = {} as Record<SongKey, number>;
    }

    for (const edge of edges) {
        const fromNode = nodes[edge.from];
        const toNode = nodes[edge.to];
        if (fromNode) {
            fromNode.next[edge.to] = (fromNode.next[edge.to] ?? 0) + 1;
        }
        if (toNode) {
            toNode.previous[edge.from] =
                (toNode.previous[edge.from] ?? 0) + 1;
        }
    }
}

/**
 * Build a unified ListeningGraph from Last.fm scrobbles.
 * Each transition between consecutive scrobbles (within 1 hour)
 * is stored as an individual timestamped edge.
 */
export function buildGraph(input: GraphInput): ListeningGraph {
    const nodes: Record<SongKey, GraphNode> = {} as Record<SongKey, GraphNode>;
    const edges: GraphEdge[] = [];
    const allTimestamps: number[] = [];

    if (input.lastfmScrobbles?.length) {
        // Sort chronologically
        const sorted = [...input.lastfmScrobbles].sort(
            (a, b) => a.timestamp - b.timestamp,
        );
        const keys: SongKey[] = [];
        const timestamps: number[] = [];

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
            );
            node.totalPlays++;
            node.playDates.push(
                new Date(scrobble.timestamp * 1000).toISOString(),
            );
            keys.push(key);
            timestamps.push(scrobble.timestamp);
        }

        // Create individual timestamped edges for consecutive scrobbles within 1 hour
        for (let i = 0; i < keys.length - 1; i++) {
            if (timestamps[i + 1]! - timestamps[i]! <= ONE_HOUR_IN_SESCONDS) {
                edges.push({
                    from: keys[i]!,
                    to: keys[i + 1]!,
                    timestamp: new Date(
                        timestamps[i]! * 1000,
                    ).toISOString(),
                });
            }
        }

        for (const t of timestamps) allTimestamps.push(t);
    }

    // Derive node.next/node.previous aggregate maps from edges
    deriveAggregates(nodes, edges);

    // Compute date range from timestamps
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
        edges,
        metadata: {
            totalScrobbles: Object.values(nodes).reduce(
                (sum, n) => sum + n.totalPlays,
                0,
            ),
            dateRange: { from, to },
            exportTimestamp: new Date().toISOString(),
            lastfmUsername: input.lastfmUsername,
        },
    };
}
