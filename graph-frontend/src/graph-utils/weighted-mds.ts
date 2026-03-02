import type Graph from "graphology"
import type { NodeAttributes, EdgeAttributes } from "#/lib/types"
import { mdsFromDistances } from "./mds"

/**
 * Weighted MDS: uses 1/weight as edge distance so that frequently
 * co-played songs are closer together.
 */
export function calculateWeightedMdsPositions(
  graph: Graph<NodeAttributes, EdgeAttributes>,
): Map<string, { x: number; y: number }> {
  const keys = graph.nodes()
  const n = keys.length
  if (n === 0) return new Map()

  const keyIndex = new Map<string, number>()
  for (let i = 0; i < n; i++) keyIndex.set(keys[i], i)

  // Build adjacency with distance = 1/weight (undirected, keep shortest)
  const adj: Map<number, Map<number, number>> = new Map()
  for (let i = 0; i < n; i++) adj.set(i, new Map())

  graph.forEachEdge((_edge, attrs, source, target) => {
    const si = keyIndex.get(source)
    const ti = keyIndex.get(target)
    if (si === undefined || ti === undefined) return
    const d = 1 / (attrs.weight || 1)
    const fwd = adj.get(si)!
    const bwd = adj.get(ti)!
    fwd.set(ti, Math.min(fwd.get(ti) ?? Infinity, d))
    bwd.set(si, Math.min(bwd.get(si) ?? Infinity, d))
  })

  // All-pairs Dijkstra
  const dist = new Float64Array(n * n)
  dist.fill(Infinity)
  for (let i = 0; i < n; i++) {
    dist[i * n + i] = 0
    dijkstraSingleSource(i, n, adj, dist)
  }

  return mdsFromDistances(keys, dist, n)
}

/** Simple single-source Dijkstra writing into the dist matrix at row `src`. */
function dijkstraSingleSource(
  src: number,
  n: number,
  adj: Map<number, Map<number, number>>,
  dist: Float64Array,
): void {
  const visited = new Uint8Array(n)
  dist[src * n + src] = 0

  for (let step = 0; step < n; step++) {
    // Find unvisited node with smallest distance
    let u = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[src * n + i] < best) {
        best = dist[src * n + i]
        u = i
      }
    }
    if (u === -1) break
    visited[u] = 1

    const neighbors = adj.get(u)
    if (!neighbors) continue
    for (const [v, w] of neighbors) {
      const alt = best + w
      if (alt < dist[src * n + v]) {
        dist[src * n + v] = alt
      }
    }
  }
}
