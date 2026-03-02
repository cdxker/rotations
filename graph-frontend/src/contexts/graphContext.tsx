import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import Graph from "graphology"
import type { EdgeAttributes, ListeningGraph, NodeAttributes } from "#/lib/types"

const GRAPH_API_BASE =
  import.meta.env.VITE_GRAPH_API_URL ?? "http://localhost:3001"

/** Compute a monochrome node color from importance (0–1 scale). */
function nodeBrightness(importance: number): string {
  const level = Math.round(64 + 140 * Math.max(0, Math.min(1, importance)))
  return `rgb(${level}, ${level}, ${level})`
}

/** Compute node radius from play count using log scale. */
function nodeSize(totalPlays: number, maxPlays: number): number {
  return 4 + (16 * Math.log(totalPlays)) / Math.log(maxPlays)
}

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

  let maxPlays = 1
  let maxPageRank = 1e-10
  for (const [, n] of entries) {
    if (n.totalPlays > maxPlays) maxPlays = n.totalPlays
    const pr = n.pageRank ?? 0
    if (pr > maxPageRank) maxPageRank = pr
  }

  for (const [key, node] of entries) {
    const importance = (node.pageRank ?? 0) / maxPageRank
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
      size: nodeSize(node.totalPlays, maxPlays),
      color: nodeBrightness(importance),
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
        color: `rgba(255, 255, 255, ${Math.min(0.25, 0.03 + weight * 0.02)})`,
      })
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
