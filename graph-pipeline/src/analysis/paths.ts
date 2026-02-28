import type { ListeningGraph, SongKey } from "../graph/types.js";

/** A single step in a path result. */
export interface PathStep {
    songKey: SongKey;
    name: string;
    artists: string[];
    /** Edge weight from this node to the next (undefined for the last node). */
    edgeWeight?: number;
}

/** Result of a path search between two songs. */
export interface PathResult {
    from: SongKey;
    to: SongKey;
    found: boolean;
    /** "shortest" (BFS) or "strongest" (max-min Dijkstra). */
    algorithm: "shortest" | "strongest";
    /** Ordered list of nodes from start to end. */
    path: PathStep[];
    /** Number of hops (edges) in the path. */
    hops: number;
    /** Sum of edge weights along the path. */
    totalWeight: number;
    /** Minimum edge weight along the path (relevant for strongest path). */
    minEdgeWeight: number;
}

/**
 * BFS shortest path — fewest hops between two songs.
 * Follows directed edges (node.next).
 */
export function shortestPath(graph: ListeningGraph, from: SongKey, to: SongKey): PathResult {
    const empty: PathResult = {
        from,
        to,
        found: false,
        algorithm: "shortest",
        path: [],
        hops: 0,
        totalWeight: 0,
        minEdgeWeight: 0,
    };

    if (!graph.nodes[from] || !graph.nodes[to]) return empty;
    if (from === to) return buildResult(graph, [from], "shortest");

    const visited = new Set<SongKey>();
    const parent = new Map<SongKey, SongKey>();
    const queue: SongKey[] = [from];
    visited.add(from);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const node = graph.nodes[current];
        if (!node) continue;

        for (const neighbor of Object.keys(node.next) as SongKey[]) {
            if (visited.has(neighbor)) continue;
            if (!graph.nodes[neighbor]) continue;

            parent.set(neighbor, current);

            if (neighbor === to) {
                // Reconstruct path
                const path: SongKey[] = [];
                let cursor: SongKey | undefined = to;
                while (cursor !== undefined) {
                    path.unshift(cursor);
                    cursor = parent.get(cursor);
                }
                return buildResult(graph, path, "shortest");
            }

            visited.add(neighbor);
            queue.push(neighbor);
        }
    }

    return empty;
}

/**
 * Modified Dijkstra to find the "strongest" path — the path that maximizes
 * the minimum edge weight (the bottleneck/widest path).
 *
 * Uses a max-priority queue on the minimum edge weight seen so far.
 * Follows directed edges (node.next).
 */
export function strongestPath(graph: ListeningGraph, from: SongKey, to: SongKey): PathResult {
    const empty: PathResult = {
        from,
        to,
        found: false,
        algorithm: "strongest",
        path: [],
        hops: 0,
        totalWeight: 0,
        minEdgeWeight: 0,
    };

    if (!graph.nodes[from] || !graph.nodes[to]) return empty;
    if (from === to) return buildResult(graph, [from], "strongest");

    // best[node] = best minimum-edge-weight to reach node from `from`
    const best = new Map<SongKey, number>();
    const parent = new Map<SongKey, SongKey>();
    best.set(from, Infinity);

    // Simple priority queue using sorted insertion (graph sizes are manageable)
    const pq: Array<{ key: SongKey; minWeight: number }> = [{ key: from, minWeight: Infinity }];

    while (pq.length > 0) {
        // Pop the entry with the highest minWeight
        pq.sort((a, b) => b.minWeight - a.minWeight);
        const { key: current, minWeight: currentMin } = pq.shift()!;

        // If we've already found a better path to this node, skip
        if (currentMin < (best.get(current) ?? -1)) continue;

        if (current === to) {
            // Reconstruct path
            const path: SongKey[] = [];
            let cursor: SongKey | undefined = to;
            while (cursor !== undefined) {
                path.unshift(cursor);
                cursor = parent.get(cursor);
            }
            return buildResult(graph, path, "strongest");
        }

        const node = graph.nodes[current];
        if (!node) continue;

        for (const [neighborKey, weight] of Object.entries(node.next)) {
            const neighbor = neighborKey as SongKey;
            if (!graph.nodes[neighbor]) continue;

            const newMin = Math.min(currentMin, weight);
            const oldBest = best.get(neighbor) ?? -1;

            if (newMin > oldBest) {
                best.set(neighbor, newMin);
                parent.set(neighbor, current);
                pq.push({ key: neighbor, minWeight: newMin });
            }
        }
    }

    return empty;
}

/** Build a PathResult from an ordered list of SongKeys. */
function buildResult(graph: ListeningGraph, keys: SongKey[], algorithm: "shortest" | "strongest"): PathResult {
    const path: PathStep[] = [];
    let totalWeight = 0;
    let minEdgeWeight = Infinity;

    for (let i = 0; i < keys.length; i++) {
        const node = graph.nodes[keys[i]!]!;
        let edgeWeight: number | undefined;

        if (i < keys.length - 1) {
            edgeWeight = node.next[keys[i + 1]!] ?? 0;
            totalWeight += edgeWeight;
            if (edgeWeight < minEdgeWeight) minEdgeWeight = edgeWeight;
        }

        path.push({
            songKey: keys[i]!,
            name: node.name,
            artists: node.artists,
            edgeWeight,
        });
    }

    const hops = Math.max(0, keys.length - 1);
    if (hops === 0) minEdgeWeight = 0;

    return {
        from: keys[0]!,
        to: keys[keys.length - 1]!,
        found: true,
        algorithm,
        path,
        hops,
        totalWeight,
        minEdgeWeight,
    };
}
