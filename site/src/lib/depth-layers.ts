import type Graph from "graphology"

/**
 * Result of a depth-layer BFS from a root node.
 * Maps each reachable node key to its depth (0 = root, 1..maxDepth).
 */
export type DepthMap = Map<string, number>

/**
 * Compute depth layers via BFS from a root node, up to maxDepth hops.
 * Also computes a "weight" for each node: the max edge weight on the
 * path from root to that node, normalized to 0–1 within each layer.
 */
export interface DepthResult {
    /** Node key → depth (0 = root) */
    depths: DepthMap
    /** Node key → normalized weight (0–1) within its depth layer */
    weights: Map<string, number>
    /** Set of edge keys that connect nodes within the depth neighborhood */
    edges: Set<string>
}

export function computeDepthLayers(
    graph: Graph,
    rootKey: string,
    maxDepth: number = 3
): DepthResult {
    const depths: DepthMap = new Map()
    const rawWeights = new Map<string, number>()
    const edges = new Set<string>()

    if (!graph.hasNode(rootKey)) {
        return { depths, weights: rawWeights, edges }
    }

    depths.set(rootKey, 0)
    rawWeights.set(rootKey, 1)

    let frontier = [rootKey]

    for (let depth = 1; depth <= maxDepth; depth++) {
        const nextFrontier: string[] = []

        for (const nodeKey of frontier) {
            graph.forEachEdge(nodeKey, (edge, edgeAttrs, source, target) => {
                const neighbor = source === nodeKey ? target : source
                if (!graph.hasNode(neighbor)) return

                // Track the edge
                edges.add(edge)

                // Only visit nodes we haven't seen yet
                if (!depths.has(neighbor)) {
                    depths.set(neighbor, depth)
                    rawWeights.set(neighbor, edgeAttrs.weight ?? 1)
                    nextFrontier.push(neighbor)
                } else if (depths.get(neighbor) === depth) {
                    // Same depth — take max weight for prominence
                    const existing = rawWeights.get(neighbor) ?? 0
                    rawWeights.set(neighbor, Math.max(existing, edgeAttrs.weight ?? 1))
                    edges.add(edge)
                }
            })
        }

        frontier = nextFrontier
    }

    // Also include edges between nodes that are both in the depth neighborhood
    graph.forEachEdge((edge, _attrs, source, target) => {
        if (depths.has(source) && depths.has(target)) {
            edges.add(edge)
        }
    })

    // Normalize weights per layer
    const weights = new Map<string, number>()
    const layerMaxWeights = new Map<number, number>()

    for (const [key, weight] of rawWeights) {
        const d = depths.get(key) ?? 0
        layerMaxWeights.set(d, Math.max(layerMaxWeights.get(d) ?? 0, weight))
    }

    for (const [key, weight] of rawWeights) {
        const d = depths.get(key) ?? 0
        const maxW = layerMaxWeights.get(d) ?? 1
        weights.set(key, maxW > 0 ? weight / maxW : 1)
    }

    return { depths, weights, edges }
}
