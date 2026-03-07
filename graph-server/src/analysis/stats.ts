import type {
    SongKey,
    GraphNode,
    ListeningGraph,
    ListeningSource,
} from "../graph/types.js";

/** Per-node computed statistics. */
export interface NodeStats {
    songKey: SongKey;
    name: string;
    artists: string[];
    totalPlays: number;
    inDegree: number;
    outDegree: number;
    weightedInDegree: number;
    weightedOutDegree: number;
    totalDegree: number;
}

/** Summary statistics for the entire graph. */
export interface GraphStats {
    totalNodes: number;
    totalEdges: number;
    totalScrobbles: number;
    dateRange: { from: string; to: string };
    sourceBreakdown: Record<ListeningSource, number>;
    averageDegree: number;
    medianDegree: number;
}

/** Ranked lists of top songs by various metrics. */
export interface Rankings {
    mostPlayed: NodeStats[];
    mostConnected: NodeStats[];
    highestInDegree: NodeStats[];
    highestOutDegree: NodeStats[];
}

/** Full stats output combining graph-level, per-node, and rankings. */
export interface StatsResult {
    graphStats: GraphStats;
    rankings: Rankings;
    nodeStats: Map<SongKey, NodeStats>;
}

/** Compute per-node statistics from a GraphNode. */
function computeNodeStats(songKey: SongKey, node: GraphNode): NodeStats {
    const inDegree = Object.keys(node.previous).length;
    const outDegree = Object.keys(node.next).length;
    const weightedInDegree = Object.values(node.previous).reduce(
        (sum, w) => sum + w,
        0,
    );
    const weightedOutDegree = Object.values(node.next).reduce(
        (sum, w) => sum + w,
        0,
    );

    return {
        songKey,
        name: node.name,
        artists: node.artists,
        totalPlays: node.totalPlays,
        inDegree,
        outDegree,
        weightedInDegree,
        weightedOutDegree,
        totalDegree: inDegree + outDegree,
    };
}

/** Compute the median of a sorted numeric array. */
function median(sorted: number[]): number {
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1]! + sorted[mid]!) / 2;
    }
    return sorted[mid]!;
}

/**
 * Compute all statistics for a ListeningGraph.
 * @param graph The listening graph to analyze.
 * @param topN Number of entries in each ranking list (default 10).
 */
export function computeStats(graph: ListeningGraph, topN = 10): StatsResult {
    const entries = Object.entries(graph.nodes) as [SongKey, GraphNode][];
    const nodeStatsMap = new Map<SongKey, NodeStats>();

    // Compute per-node stats
    for (const [key, node] of entries) {
        nodeStatsMap.set(key, computeNodeStats(key, node));
    }

    // Count unique edges and source breakdown
    let totalEdges = 0;
    const sourceBreakdown: Record<string, number> = {
        lastfm: 0,
    };

    for (const [, node] of entries) {
        totalEdges += Object.keys(node.next).length;
        if (node.sourcePlays) {
            for (const [source, count] of Object.entries(node.sourcePlays)) {
                sourceBreakdown[source] =
                    (sourceBreakdown[source] ?? 0) + (count ?? 0);
            }
        } else {
            // Fallback for graphs without sourcePlays (e.g. loaded from older DB)
            for (const source of node.sources) {
                sourceBreakdown[source] = (sourceBreakdown[source] ?? 0) + 1;
            }
        }
    }

    // Degree distribution for average/median
    const allStats = [...nodeStatsMap.values()];
    const degrees = allStats.map((s) => s.totalDegree).sort((a, b) => a - b);
    const avgDegree =
        degrees.length > 0
            ? degrees.reduce((sum, d) => sum + d, 0) / degrees.length
            : 0;

    const graphStats: GraphStats = {
        totalNodes: entries.length,
        totalEdges,
        totalScrobbles: graph.metadata.totalScrobbles,
        dateRange: graph.metadata.dateRange,
        sourceBreakdown: sourceBreakdown as Record<ListeningSource, number>,
        averageDegree: Math.round(avgDegree * 100) / 100,
        medianDegree: median(degrees),
    };

    // Rankings
    const sortedByPlays = [...allStats].sort(
        (a, b) => b.totalPlays - a.totalPlays,
    );
    const sortedByConnected = [...allStats].sort(
        (a, b) => b.totalDegree - a.totalDegree,
    );
    const sortedByInDegree = [...allStats].sort(
        (a, b) => b.inDegree - a.inDegree,
    );
    const sortedByOutDegree = [...allStats].sort(
        (a, b) => b.outDegree - a.outDegree,
    );

    const rankings: Rankings = {
        mostPlayed: sortedByPlays.slice(0, topN),
        mostConnected: sortedByConnected.slice(0, topN),
        highestInDegree: sortedByInDegree.slice(0, topN),
        highestOutDegree: sortedByOutDegree.slice(0, topN),
    };

    return { graphStats, rankings, nodeStats: nodeStatsMap };
}
