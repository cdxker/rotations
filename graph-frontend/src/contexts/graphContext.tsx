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

async function fetchGraph(user: string): Promise<ListeningGraph> {
  const response = await fetch(`${GRAPH_API_BASE}/graph?user=${encodeURIComponent(user)}`)
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

  for (const [uuid, node] of entries) {
    graph.addNode(uuid, {
      label: `${node.artists[0] ?? "Unknown"} — ${node.name}`,
      songKey: node.songKey,
      artists: node.artists,
      albumName: node.albumName,
      lastfmUrl: node.lastfmUrl,
      imageUrl: node.imageUrl,
      totalPlays: node.totalPlays,
      sources: node.sources,
      pageRank: node.pageRank ?? 0,
      playDates: node.playDates ?? [],
      positions: node.positions,
      size: 4,
      color: "#ffffff",
      x: 0,
      y: 0,
    })
  }

  for (const [fromUuid, node] of entries) {
    for (const [toUuid, weight] of Object.entries(node.next)) {
      if (!graph.hasNode(toUuid)) continue
      if (graph.hasEdge(fromUuid, toUuid)) continue

      graph.addDirectedEdge(fromUuid, toUuid, {
        weight,
        size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
        color: `rgba(0, 0, 0, ${Math.min(0.6, 0.15 + weight * 0.05)})`,
      })
    }
  }

  return graph
}

export type LoadState = "loading" | "loaded" | "error"

type GraphContextValue = {
  graph: Graph<NodeAttributes, EdgeAttributes> | null
  raw: ListeningGraph | null
  state: LoadState
  error: string | null
  setUser: (user: string) => void
};

const GraphContext = createContext<GraphContextValue | null>(null)

export function GraphProvider({ children, initialUser }: { children: ReactNode, initialUser: string }) {
  const [graph, setGraph] =
    useState<Graph<NodeAttributes, EdgeAttributes> | null>(null)
  const [raw, setRaw] = useState<ListeningGraph | null>(null)
  const [state, setState] = useState<LoadState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<string>(initialUser);

  useEffect(() => {
    let cancelled = false
    setState("loading")
    setError(null)

    async function load() {
      try {
        const data = await fetchGraph(user)
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
  }, [user])

  const context: GraphContextValue = {
    graph,
    raw,
    state,
    error,
    setUser
  };

  return (
    <GraphContext.Provider value={context}>
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
