import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import Graph from "graphology"

/** Canonical song identity: `lowercase(artist)::lowercase(track_name)`. */
export type SongKey = `${string}::${string}`

/** Data source that contributed a scrobble or track ordering. */
export type ListeningSource = "lastfm" | "spotify-recent" | "spotify-playlist"

/** A node in the listening graph representing a single song. */
export interface GraphNode {
  name: string
  artists: string[]
  albumName?: string
  spotifyId?: string
  lastfmUrl?: string
  imageUrl?: string
  next: Record<SongKey, number>
  previous: Record<SongKey, number>
  totalPlays: number
  sources: ListeningSource[]
  pageRank: number
}

/** Metadata about the graph export. */
export interface GraphMetadata {
  totalScrobbles: number
  dateRange: { from: string; to: string }
  exportTimestamp: string
  lastfmUsername?: string
  spotifyUsername?: string
}

/** The full listening graph as returned by GET /graph. */
export interface ListeningGraph {
  nodes: Record<SongKey, GraphNode>
  metadata: GraphMetadata
}

// ---------------------------------------------------------------------------
// Graphology attribute types
// ---------------------------------------------------------------------------

/** Attributes stored on each graphology node. */
export interface NodeAttributes {
  label: string
  artists: string[]
  albumName?: string
  spotifyId?: string
  lastfmUrl?: string
  imageUrl?: string
  totalPlays: number
  sources: string[]
  pageRank: number
  size: number
  color: string
  x: number
  y: number
}

/** Attributes stored on each graphology edge. */
export interface EdgeAttributes {
  weight: number
  size: number
  color: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function hashAngle(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return (hash % 10000) / 10000 * Math.PI * 2
}

function calculatePosition(key: string, importance: number) {
  return {
    x: Math.cos(hashAngle(key)) * Math.pow(1 - importance, 2) * 500,
    y: Math.sin(hashAngle(key)) * Math.pow(1 - importance, 2) * 500,
  }
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
      ...calculatePosition(key, importance)
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

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

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
