import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import Graph from "graphology"
import { connectedComponents } from "graphology-components"
import type { EdgeAttributes, ListeningGraph, NodeAttributes } from "#/lib/types"

const GRAPH_API_BASE =
  import.meta.env.VITE_GRAPH_API_URL ?? "http://localhost:3001"

/** Distinct high-contrast colors for connected components. */
const COMPONENT_COLORS = [
  "#ff3366", // hot pink
  "#00ffcc", // cyan/mint
  "#ffcc00", // yellow
  "#7b4dff", // purple
  "#ff6600", // orange
  "#00ccff", // sky blue
  "#ff0099", // magenta
  "#33ff66", // green
  "#ff4444", // red
  "#00ffff", // aqua
  "#ffff00", // bright yellow
  "#cc33ff", // violet
  "#ff8833", // tangerine
  "#33ccff", // light blue
  "#66ff33", // lime
  "#ff3399", // pink
]

/** Fetch the full graph JSON from the API. */
async function fetchGraph(): Promise<ListeningGraph> {
  const response = await fetch(`${GRAPH_API_BASE}/graph`)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch graph: ${response.status} ${response.statusText}`,
    )
  }
  return response.json()
}


function toGraphology(
  listeningGraph: ListeningGraph,
): Graph<NodeAttributes, EdgeAttributes> {
  const graph = new Graph<NodeAttributes, EdgeAttributes>()
  const entries = Object.entries(listeningGraph.nodes)

  if (entries.length === 0) return graph

  let maxPageRank = 1e-10
  for (const [, n] of entries) {
    const pr = n.pageRank ?? 0
    if (pr > maxPageRank) maxPageRank = pr
  }

  for (const [key, node] of entries) {
    graph.addNode(key, {
      label: `${node.artists[0] ?? "Unknown"} — ${node.name}`,
      artists: node.artists,
      albumName: node.albumName,
      spotifyId: node.spotifyId,
      lastfmUrl: node.lastfmUrl,
      imageUrl: node.imageUrl,
      totalPlays: node.totalPlays,
      sources: node.sources,
      pageRank: node.pageRank ?? 0,
      playDates: node.playDates ?? [],
      size: 4, // placeholder; nodeReducer in RenderGraph sets actual size per layout
      color: "#ffffff", // placeholder, overwritten by component coloring
      x: 0,
      y: 0,
    })
  }

  for (const [fromKey, node] of entries) {
    for (const [toKey, weight] of Object.entries(node.next)) {
      if (!graph.hasNode(toKey)) continue
      if (graph.hasEdge(fromKey, toKey)) continue

      graph.addDirectedEdge(fromKey, toKey, {
        weight,
        size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
        color: `rgba(0, 0, 0, ${Math.min(0.6, 0.15 + weight * 0.05)})`,
      })
    }
  }

  // Color each disconnected component a different high-contrast color
  const components = connectedComponents(graph)
  for (let i = 0; i < components.length; i++) {
    const color = COMPONENT_COLORS[i % COMPONENT_COLORS.length]
    for (const key of components[i]) {
      graph.setNodeAttribute(key, "color", color)
    }
  }

  return graph
}

export type LoadState = "loading" | "loaded" | "error"

interface GraphContextValue {
  graph: Graph<NodeAttributes, EdgeAttributes> | null
  raw: ListeningGraph | null
  state: LoadState
  error: string | null
}

const GraphContext = createContext<GraphContextValue | null>(null)

export function GraphProvider({ children }: { children: ReactNode }) {
  const [graph, setGraph] =
    useState<Graph<NodeAttributes, EdgeAttributes> | null>(null)
  const [raw, setRaw] = useState<ListeningGraph | null>(null)
  const [state, setState] = useState<LoadState>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await fetchGraph()
        if (cancelled) return

        const g = toGraphology(data)
        setRaw(data)
        setGraph(g)
        setState("loaded")
      } catch {
        if (cancelled) return
        setState("error")
        setError("Could not reach graph API")
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <GraphContext.Provider value={{ graph, raw, state, error }}>
      {children}
    </GraphContext.Provider>
  )
}

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext)
  if (!ctx) {
    throw new Error("useGraph must be used within a <GraphProvider>")
  }
  return ctx
}
