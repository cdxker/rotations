import type { SongKey, ListeningGraph } from "../graph/types.js";

export interface PageRankOptions {
    /** Damping factor (probability of following a link vs. random jump). Default: 0.85. */
    dampingFactor?: number;
    /** Stop when max rank change between iterations is below this. Default: 0.0001. */
    convergenceThreshold?: number;
    /** Maximum number of iterations. Default: 100. */
    maxIterations?: number;
}

export interface PageRankResult {
    /** Number of iterations until convergence (or max). */
    iterations: number;
    /** Whether the algorithm converged before hitting maxIterations. */
    converged: boolean;
    /** Max rank change in the final iteration. */
    maxDelta: number;
}

/**
 * Run weighted PageRank on a ListeningGraph.
 *
 * Mutates the graph in place, setting `pageRank` on each node.
 * Returns metadata about the computation.
 *
 * Algorithm:
 * 1. Initialize all nodes with rank 1/N
 * 2. For each iteration:
 *    - Dangling nodes (no outgoing edges) distribute their rank evenly to all nodes
 *    - Each node distributes rank to neighbors proportional to edge weight
 *    - Apply damping: rank = (1-d)/N + d * (incoming rank)
 * 3. Stop when converged or max iterations reached
 */
export function computePageRank(
    graph: ListeningGraph,
    options: PageRankOptions = {},
): PageRankResult {
    const {
        dampingFactor: d = 0.85,
        convergenceThreshold = 0.0001,
        maxIterations = 100,
    } = options;

    const keys = Object.keys(graph.nodes) as SongKey[];
    const n = keys.length;

    if (n === 0) {
        return { iterations: 0, converged: true, maxDelta: 0 };
    }

    // Initialize ranks
    const ranks = new Map<SongKey, number>();
    for (const key of keys) {
        ranks.set(key, 1 / n);
    }

    // Precompute outgoing weight sums for normalization
    const outWeightSums = new Map<SongKey, number>();
    const danglingNodes: SongKey[] = [];

    for (const key of keys) {
        const node = graph.nodes[key]!;
        const nextEntries = Object.values(node.next);
        const totalWeight = nextEntries.reduce((sum, w) => sum + w, 0);
        outWeightSums.set(key, totalWeight);
        if (totalWeight === 0) {
            danglingNodes.push(key);
        }
    }

    let iterations = 0;
    let maxDelta = Infinity;
    let converged = false;

    while (iterations < maxIterations && !converged) {
        iterations++;
        const newRanks = new Map<SongKey, number>();

        // Compute dangling rank contribution (distributed evenly)
        let danglingSum = 0;
        for (const dk of danglingNodes) {
            danglingSum += ranks.get(dk)!;
        }
        const danglingContribution = danglingSum / n;

        // Initialize new ranks with teleportation + dangling contribution
        for (const key of keys) {
            newRanks.set(key, (1 - d) / n + d * danglingContribution);
        }

        // Distribute rank along edges (weighted)
        for (const fromKey of keys) {
            const node = graph.nodes[fromKey]!;
            const outSum = outWeightSums.get(fromKey)!;
            if (outSum === 0) continue; // dangling — already handled

            const fromRank = ranks.get(fromKey)!;

            for (const [toKeyStr, weight] of Object.entries(node.next)) {
                const toKey = toKeyStr as SongKey;
                const contribution = (fromRank * weight) / outSum;
                newRanks.set(
                    toKey,
                    (newRanks.get(toKey) ?? 0) + d * contribution,
                );
            }
        }

        // Check convergence
        maxDelta = 0;
        for (const key of keys) {
            const delta = Math.abs(newRanks.get(key)! - ranks.get(key)!);
            if (delta > maxDelta) maxDelta = delta;
        }

        // Update ranks
        for (const [key, rank] of newRanks) {
            ranks.set(key, rank);
        }

        if (maxDelta < convergenceThreshold) {
            converged = true;
        }
    }

    // Write ranks back to graph nodes
    for (const key of keys) {
        graph.nodes[key]!.pageRank = ranks.get(key)!;
    }

    return { iterations, converged, maxDelta };
}

/** Get the top N nodes by PageRank score. Assumes pageRank has been computed. */
export function getTopByPageRank(
    graph: ListeningGraph,
    n: number = 20,
): Array<{
    songKey: SongKey;
    name: string;
    artists: string[];
    pageRank: number;
}> {
    const entries = (
        Object.entries(graph.nodes) as [
            SongKey,
            (typeof graph.nodes)[SongKey],
        ][]
    )
        .filter(([, node]) => node.pageRank != null)
        .map(([key, node]) => ({
            songKey: key,
            name: node.name,
            artists: node.artists,
            pageRank: node.pageRank!,
        }))
        .sort((a, b) => b.pageRank - a.pageRank);

    return entries.slice(0, n);
}
