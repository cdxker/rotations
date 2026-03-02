import type Graph from "graphology"
import type { NodeAttributes, EdgeAttributes } from "#/lib/types"
import { calculateMdsPositions } from "./mds"
import { calculatePageRankPositions } from "./pageRank"

export type LayoutMode = "pagerank" | "mds"

export default function setNodePositions(
  graph: Graph<NodeAttributes, EdgeAttributes>,
  mode: LayoutMode,
): void {
  const positions =
    mode === "mds" ? calculateMdsPositions(graph) : calculatePageRankPositions(graph)

  for (const [key, pos] of positions) {
    graph.setNodeAttribute(key, "x", pos.x)
    graph.setNodeAttribute(key, "y", pos.y)
  }
}
