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

  for (const [key, node] of entries) {
    graph.addNode(key, {
      label: `${node.artists[0] ?? "Unknown"} — ${node.name}`,
      artists: node.artists,
      albumName: node.albumName,
      lastfmUrl: node.lastfmUrl,
      imageUrl: node.imageUrl,
      totalPlays: node.totalPlays,
      pageRank: node.pageRank ?? 0,
      playDates: node.playDates ?? [],
      size: 4,
      color: "#ffffff",
      x: 0,
      y: 0,
    })
  }

  // Aggregate parallel edges: group by (from, to), collect timestamps, count as weight
  const edgeMap = new Map<string, { from: string; to: string; timestamps: string[] }>()
  for (const edge of listeningGraph.edges) {
    const mapKey = `${edge.from}→${edge.to}`
    const existing = edgeMap.get(mapKey)
    if (existing) {
      existing.timestamps.push(edge.timestamp)
    } else {
      edgeMap.set(mapKey, { from: edge.from, to: edge.to, timestamps: [edge.timestamp] })
    }
  }

  for (const [, agg] of edgeMap) {
    if (!graph.hasNode(agg.from) || !graph.hasNode(agg.to)) continue
    if (graph.hasEdge(agg.from, agg.to)) continue

    const weight = agg.timestamps.length
    graph.addDirectedEdge(agg.from, agg.to, {
      weight,
      timestamps: agg.timestamps,
      size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
      color: `rgba(0, 0, 0, ${Math.min(0.6, 0.15 + weight * 0.05)})`,
    })
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
