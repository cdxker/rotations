import type { ListeningGraph, SongKey, GraphNode } from "./graph/types.js";

/** Create a minimal GraphNode with sensible defaults, overridable via partial. */
export function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        name: "Test",
        artists: ["Artist"],
        next: {} as Record<SongKey, number>,
        previous: {} as Record<SongKey, number>,
        totalPlays: 1,
        sources: ["lastfm"],
        ...overrides,
    };
}

/** Wrap a bag of nodes into a ListeningGraph with empty metadata. */
export function makeGraph(nodes: Record<string, GraphNode>): ListeningGraph {
    return {
        nodes: nodes as Record<SongKey, GraphNode>,
        metadata: {
            totalScrobbles: 0,
            dateRange: { from: "", to: "" },
            exportTimestamp: "",
        },
    };
}

/**
 * Build a test graph from a simple edge list.
 * Each tuple is [fromKey, toKey, weight]. Nodes are created automatically
 * by splitting the key on "::" (artist::track).
 */
export function buildTestGraph(
    edges: Array<[string, string, number]>,
): ListeningGraph {
    const nodes: Record<string, GraphNode> = {};

    // Collect all node keys
    const keys = new Set<string>();
    for (const [from, to] of edges) {
        keys.add(from);
        keys.add(to);
    }

    // Create nodes
    for (const key of keys) {
        const [artist, track] = key.split("::");
        nodes[key] = makeNode({ name: track!, artists: [artist!] });
    }

    // Add edges
    for (const [from, to, weight] of edges) {
        nodes[from]!.next[to as SongKey] = weight;
        nodes[to]!.previous[from as SongKey] = weight;
    }

    return makeGraph(nodes);
}
