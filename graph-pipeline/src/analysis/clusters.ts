import type { SongKey, ListeningGraph } from "../graph/types.js";

export interface ClusterStats {
    clusterId: number;
    size: number;
    topSongs: Array<{
        songKey: SongKey;
        name: string;
        artists: string[];
        totalPlays: number;
    }>;
    interClusterEdges: number;
}

export interface ClusterResult {
    clusterCount: number;
    clusters: ClusterStats[];
    modularity: number;
}

/**
 * Detect communities in the listening graph using the Louvain method.
 *
 * The Louvain algorithm optimizes modularity in two phases:
 * 1. Local: move each node to the neighboring community that gives the best modularity gain
 * 2. Aggregate: build a new graph where communities become nodes, repeat
 *
 * For our graph, edges are treated as undirected (sum of next + previous weights)
 * since community structure is about mutual affinity, not direction.
 *
 * Mutates the graph in place, setting `clusterId` on each node.
 */
export function detectClusters(
    graph: ListeningGraph,
    maxTopSongs: number = 5,
): ClusterResult {
    const keys = Object.keys(graph.nodes) as SongKey[];
    const n = keys.length;

    if (n === 0) {
        return { clusterCount: 0, clusters: [], modularity: 0 };
    }

    // Build undirected weighted adjacency (sum of next + previous weights between pairs)
    const keyIndex = new Map<SongKey, number>();
    for (let i = 0; i < keys.length; i++) {
        keyIndex.set(keys[i]!, i);
    }

    // Adjacency: weights[i] = Map<j, weight> (undirected)
    const weights: Map<number, number>[] = Array.from(
        { length: n },
        () => new Map(),
    );
    let totalWeight = 0;

    for (let i = 0; i < keys.length; i++) {
        const node = graph.nodes[keys[i]!]!;
        for (const [toKeyStr, w] of Object.entries(node.next)) {
            const j = keyIndex.get(toKeyStr as SongKey);
            if (j === undefined) continue;

            // Add weight in both directions (undirected)
            weights[i]!.set(j, (weights[i]!.get(j) ?? 0) + w);
            weights[j]!.set(i, (weights[j]!.get(i) ?? 0) + w);
            totalWeight += w;
        }
    }

    if (totalWeight === 0) {
        // No edges — each node is its own cluster
        for (let i = 0; i < n; i++) {
            graph.nodes[keys[i]!]!.clusterId = i;
        }
        return {
            clusterCount: n,
            clusters: keys.map((key, i) => ({
                clusterId: i,
                size: 1,
                topSongs: [
                    {
                        songKey: key,
                        name: graph.nodes[key]!.name,
                        artists: graph.nodes[key]!.artists,
                        totalPlays: graph.nodes[key]!.totalPlays,
                    },
                ],
                interClusterEdges: 0,
            })),
            modularity: 0,
        };
    }

    // m = total edge weight (each edge counted once in each direction, so divide by 2)
    // But since we added each directed edge once to both sides, totalWeight = sum of directed weights
    // For modularity, m = totalWeight (since we treat directed as undirected, each original edge contributes once)
    const m = totalWeight;

    // Weighted degree of each node (sum of all edge weights)
    const degree: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        let d = 0;
        for (const w of weights[i]!.values()) {
            d += w;
        }
        degree[i] = d;
    }

    // Phase 1: Local optimization
    // Initialize: each node in its own community
    const community: number[] = Array.from({ length: n }, (_, i) => i);

    // Sum of degrees of nodes in each community
    const sigmaTot: number[] = [...degree];

    let improved = true;
    let passes = 0;
    const maxPasses = 20;

    while (improved && passes < maxPasses) {
        improved = false;
        passes++;

        for (let i = 0; i < n; i++) {
            const currentComm = community[i]!;
            const ki = degree[i]!;

            // Calculate weight from i to each neighboring community
            const neighborComms = new Map<number, number>();
            for (const [j, w] of weights[i]!) {
                const cj = community[j]!;
                neighborComms.set(cj, (neighborComms.get(cj) ?? 0) + w);
            }

            // Weight from i to its current community
            const kiIn = neighborComms.get(currentComm) ?? 0;

            // Remove i from its current community
            sigmaTot[currentComm]! -= ki;

            // Find the community that gives the best modularity gain
            // Standard Louvain formula: ΔQ = k_{i,in}/m - Σ_tot * k_i / (2m²)
            let bestComm = currentComm;
            let bestGain = 0;
            const twoM2 = 2 * m * m;

            for (const [comm, kiComm] of neighborComms) {
                const gain = kiComm / m - (sigmaTot[comm]! * ki) / twoM2;
                if (gain > bestGain) {
                    bestGain = gain;
                    bestComm = comm;
                }
            }

            // Also consider staying in current community
            const stayGain = kiIn / m - (sigmaTot[currentComm]! * ki) / twoM2;
            if (stayGain >= bestGain) {
                bestComm = currentComm;
                bestGain = stayGain;
            }

            // Move i to best community
            community[i] = bestComm;
            sigmaTot[bestComm]! += ki;

            if (bestComm !== currentComm) {
                improved = true;
            }
        }
    }

    // Renumber communities to be contiguous (0, 1, 2, ...)
    const communityMap = new Map<number, number>();
    let nextId = 0;
    for (let i = 0; i < n; i++) {
        const c = community[i]!;
        if (!communityMap.has(c)) {
            communityMap.set(c, nextId++);
        }
        community[i] = communityMap.get(c)!;
    }

    // Write cluster IDs to graph nodes
    for (let i = 0; i < n; i++) {
        graph.nodes[keys[i]!]!.clusterId = community[i]!;
    }

    // Compute modularity
    const modularity = computeModularity(weights, community, degree, m, n);

    // Compute cluster stats
    const clusterCount = nextId;
    const clusters = computeClusterStats(
        graph,
        keys,
        community,
        weights,
        keyIndex,
        clusterCount,
        maxTopSongs,
    );

    return { clusterCount, clusters, modularity };
}

function computeModularity(
    weights: Map<number, number>[],
    community: number[],
    degree: number[],
    m: number,
    n: number,
): number {
    // Per-community formula: Q = Σ_c [L_c/m − (d_c/(2m))²]
    // L_c = sum of edge weights within community c (each undirected edge counted once)
    // d_c = sum of degrees of nodes in community c
    const communityL = new Map<number, number>();
    const communityD = new Map<number, number>();

    for (let i = 0; i < n; i++) {
        const c = community[i]!;
        communityD.set(c, (communityD.get(c) ?? 0) + degree[i]!);

        for (const [j, w] of weights[i]!) {
            // Only count each edge once (i < j) to avoid double-counting
            if (community[j] === c && i < j) {
                communityL.set(c, (communityL.get(c) ?? 0) + w);
            }
        }
    }

    let q = 0;
    for (const c of communityD.keys()) {
        const lc = communityL.get(c) ?? 0;
        const dc = communityD.get(c)!;
        q += lc / m - (dc / (2 * m)) ** 2;
    }
    return q;
}

function computeClusterStats(
    graph: ListeningGraph,
    keys: SongKey[],
    community: number[],
    weights: Map<number, number>[],
    keyIndex: Map<SongKey, number>,
    clusterCount: number,
    maxTopSongs: number,
): ClusterStats[] {
    const clusters: ClusterStats[] = [];

    for (let c = 0; c < clusterCount; c++) {
        const memberIndices = community
            .map((comm, idx) => (comm === c ? idx : -1))
            .filter((idx) => idx >= 0);

        const members = memberIndices.map((idx) => ({
            songKey: keys[idx]!,
            node: graph.nodes[keys[idx]!]!,
        }));

        // Top songs by totalPlays
        const topSongs = members
            .sort((a, b) => b.node.totalPlays - a.node.totalPlays)
            .slice(0, maxTopSongs)
            .map((m) => ({
                songKey: m.songKey,
                name: m.node.name,
                artists: m.node.artists,
                totalPlays: m.node.totalPlays,
            }));

        // Count inter-cluster edges (edges from this cluster to other clusters)
        let interClusterEdges = 0;
        for (const idx of memberIndices) {
            for (const [j] of weights[idx]!) {
                if (community[j] !== c) {
                    interClusterEdges++;
                }
            }
        }

        clusters.push({
            clusterId: c,
            size: members.length,
            topSongs,
            interClusterEdges,
        });
    }

    return clusters;
}
