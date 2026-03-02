import type Graph from "graphology"
import type { NodeAttributes, EdgeAttributes } from "#/lib/types"

function hashAngle(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return ((hash % 10000) / 10000) * Math.PI * 2
}

/**
 * Position nodes radially: high-pageRank nodes near center,
 * low-pageRank nodes pushed outward. Angle determined by key hash.
 */
export function calculatePageRankPositions(
  graph: Graph<NodeAttributes, EdgeAttributes>,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()

  let maxPageRank = 1e-10
  graph.forEachNode((_key, attrs) => {
    if (attrs.pageRank > maxPageRank) maxPageRank = attrs.pageRank
  })

  graph.forEachNode((key, attrs) => {
    const importance = attrs.pageRank / maxPageRank
    const angle = hashAngle(key)
    const radius = Math.pow(1 - importance, 2) * 500
    result.set(key, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  })

  return result
}
