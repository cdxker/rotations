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
    positions =
      mode === 'mds'
        ? calculateMdsPositions(graph)
        : mode === 'weighted-mds'
          ? calculateWeightedMdsPositions(graph)
          : calculatePageRankPositions(graph)
    cache[mode] = positions
  }

  for (const [key, pos] of positions) {
    graph.setNodeAttribute(key, 'x', pos.x)
    graph.setNodeAttribute(key, 'y', pos.y)
  }
}
