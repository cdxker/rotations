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

  // Log-scale distances to compress the extreme range caused by 1/weight.
  // This prevents huge gaps between loosely connected nodes while still
  // keeping relative ordering intact.
  for (let k = 0; k < n * n; k++) {
    if (dist[k] > 0 && isFinite(dist[k])) {
      dist[k] = Math.log1p(dist[k])
    }
  }

  const positions = mdsFromDistances(keys, dist, n)

  // Post-process: push overlapping nodes apart so every node is visible.
  spreadOverlappingNodes(positions, 30)

  return positions
}

/**
 * Iteratively push nodes apart that are closer than `minDist`,
 * then re-center the layout.
 */
function spreadOverlappingNodes(
  positions: Map<string, { x: number; y: number }>,
  minDist: number,
): void {
  const nodes: [string, { x: number; y: number }][] = Array.from(
    positions.entries(),
  )
  const n = nodes.length
  if (n < 2) return

  const ITERATIONS = 50
  const STRENGTH = 0.5

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let anyOverlap = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i][1]
        const b = nodes[j][1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < minDist) {
          anyOverlap = true
          const overlap = minDist - d
          const push = (overlap * STRENGTH) / 2
          // Use a random-ish angle when nodes are exactly coincident
          const nx = d > 0.001 ? dx / d : Math.cos(i + j)
          const ny = d > 0.001 ? dy / d : Math.sin(i + j)
          a.x -= nx * push
          a.y -= ny * push
          b.x += nx * push
          b.y += ny * push
        }
      }
    }
    if (!anyOverlap) break
  }

  // Re-center around origin
  let cx = 0,
    cy = 0
  for (const [, p] of nodes) {
    cx += p.x
    cy += p.y
  }
  cx /= n
  cy /= n
  for (const [, p] of nodes) {
    p.x -= cx
    p.y -= cy
  }
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
