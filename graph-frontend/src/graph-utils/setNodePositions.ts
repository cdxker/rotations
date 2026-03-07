import type Graph from 'graphology'
import type { NodeAttributes, EdgeAttributes } from '#/lib/types'
import { calculateMdsPositions } from './mds'
import { calculatePageRankPositions } from './pageRank'
import { calculateWeightedMdsPositions } from './weighted-mds'

export type LayoutMode = 'pagerank' | 'mds' | 'weighted-mds'

type PositionMap = Map<string, { x: number; y: number }>

const cache: Record<LayoutMode, PositionMap | undefined> = {
  pagerank: undefined,
  mds: undefined,
  'weighted-mds': undefined,
}

export default function setNodePositions(
  graph: Graph<NodeAttributes, EdgeAttributes>,
  mode: LayoutMode,
): void {
  let positions = cache[mode];
  if (!positions) {
    // Try to read pre-computed positions from node attributes
    positions = readServerPositions(graph, mode)

    // Fall back to client-side calculation if not available
    if (!positions) {
      positions =
        mode === 'mds'
          ? calculateMdsPositions(graph)
          : mode === 'weighted-mds'
            ? calculateWeightedMdsPositions(graph)
            : calculatePageRankPositions(graph)
    }
    cache[mode] = positions
  }

  for (const [key, pos] of positions) {
    graph.setNodeAttribute(key, 'x', pos.x)
    graph.setNodeAttribute(key, 'y', pos.y)
  }
}

/** Read pre-computed positions from server-provided node data. Returns null if not available. */
function readServerPositions(
  graph: Graph<NodeAttributes, EdgeAttributes>,
  mode: LayoutMode,
): PositionMap | null {
  const positions = new Map<string, { x: number; y: number }>()
  let hasAny = false

  graph.forEachNode((key, attrs) => {
    const pos = (attrs as NodeAttributes & { positions?: Record<string, { x: number; y: number }> }).positions?.[mode]
    if (pos) {
      positions.set(key, { x: pos.x, y: pos.y })
      hasAny = true
    }
  })

  return hasAny ? positions : null
}
