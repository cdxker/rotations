import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"
import Graph from "graphology"
import type { EdgeAttributes, ListeningGraph, NodeAttributes } from "#/lib/types"

const GRAPH_API_BASE =
  import.meta.env.VITE_GRAPH_API_URL ?? "http://localhost:3001"

class UserNotFoundError extends Error {
  constructor(user: string) {
    super(`User not found: ${user}`)
    this.name = "UserNotFoundError"
  }
}

async function fetchGraph(user: string): Promise<ListeningGraph> {
  const response = await fetch(`${GRAPH_API_BASE}/graph?user=${encodeURIComponent(user)}`)
  if (response.status === 404) {
    throw new UserNotFoundError(user)
  }
  if (!response.ok) {
    throw new Error(
      `Failed to fetch graph: ${response.status} ${response.statusText}`,
    )
  }
  return response.json()
}

async function runPipeline(username: string): Promise<void> {
  const response = await fetch(`${GRAPH_API_BASE}/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })
  if (!response.ok) {
    throw new Error(
      `Pipeline failed: ${response.status} ${response.statusText}`,
    )
  }
}

async function fetchGraphWithPipelineFallback(user: string): Promise<ListeningGraph> {
  try {
    return await fetchGraph(user)
  } catch (e) {
    if (e instanceof UserNotFoundError) {
      await runPipeline(user)
      return await fetchGraph(user)
    }
    throw e
  }
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
};

const GraphContext = createContext<string | null>(null)

export function GraphProvider({ children, initialUser }: { children: ReactNode, initialUser: string }) {
  return (
    <GraphContext.Provider value={initialUser}>
      {children}
    </GraphContext.Provider>
  )
}

export function useGraph(): GraphContextValue {
  const user = useContext(GraphContext)
  if (!user) {
    throw new Error("useGraph must be used within a <GraphProvider>")
  }

  const { data, isPending, isError } = useQuery({
    queryKey: ["graph", user],
    queryFn: () => fetchGraphWithPipelineFallback(user),
    retry: false,
  })

  const graph = useMemo(() => (data ? toGraphology(data) : null), [data])

  const state: LoadState = isPending ? "loading" : isError ? "error" : "loaded"

  return {
    graph,
    raw: data ?? null,
    state,
    error: isError ? "Could not reach graph API" : null,
  }
}
