/** Canonical song identity: `lowercase(artist)::lowercase(track_name)`. */
export type SongKey = `${string}::${string}`

/** Data source that contributed a scrobble or track ordering. */
export type ListeningSource = "lastfm"

/** A node in the listening graph representing a single song (compact API format with UUID keys). */
export interface GraphNode {
  songKey: SongKey
  mbid?: string
  name: string
  artists: string[]
  albumName?: string
  lastfmUrl?: string
  imageUrl?: string
  next: Record<string, number>
  previous: Record<string, number>
  totalPlays: number
  sources: ListeningSource[]
  pageRank?: number
  clusterId?: number
  playDates: string[]
  positions?: {
    pagerank?: { x: number; y: number }
    mds?: { x: number; y: number }
    "weighted-mds"?: { x: number; y: number }
  }
}

/** Metadata about the graph export. */
export interface GraphMetadata {
  totalScrobbles: number
  dateRange: { from: string; to: string }
  exportTimestamp: string
  lastfmUsername?: string
}

/** The full listening graph as returned by GET /graph (UUID-keyed nodes). */
export interface ListeningGraph {
  nodes: Record<string, GraphNode>
  metadata: GraphMetadata
}

/** Per-node metric scores — only the field matching the requested layout is populated. */
export interface NodeMetrics {
  pageRank?: number
  mdsScore?: number
  weightedMdsScore?: number
}

/** Response from GET /graph/metrics — per-node metrics keyed by node UUID. */
export interface GraphMetricsResponse {
  metrics: Record<string, NodeMetrics>
}

// ---------------------------------------------------------------------------
// Graphology attribute types
// ---------------------------------------------------------------------------

/** Attributes stored on each graphology node. */
export interface NodeAttributes {
  label: string
  songKey: SongKey
  artists: string[]
  albumName?: string
  lastfmUrl?: string
  imageUrl?: string
  totalPlays: number
  sources: string[]
  pageRank: number
  metric: number
  playDates: string[]
  positions?: {
    pagerank?: { x: number; y: number }
    mds?: { x: number; y: number }
    "weighted-mds"?: { x: number; y: number }
  }
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
