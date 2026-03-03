/** Canonical song identity: `lowercase(artist)::lowercase(track_name)`. */
export type SongKey = `${string}::${string}`

/** A single transition event between two songs, with a timestamp. */
export interface GraphEdge {
  from: SongKey
  to: SongKey
  /** ISO 8601 timestamp of when this transition occurred. */
  timestamp: string
}

/** A node in the listening graph representing a single song. */
export interface GraphNode {
  name: string
  artists: string[]
  albumName?: string
  lastfmUrl?: string
  imageUrl?: string
  next: Record<SongKey, number>
  previous: Record<SongKey, number>
  totalPlays: number
  pageRank: number
  playDates: string[]
}

/** Metadata about the graph export. */
export interface GraphMetadata {
  totalScrobbles: number
  dateRange: { from: string; to: string }
  exportTimestamp: string
  lastfmUsername?: string
}

/** The full listening graph as returned by GET /graph. */
export interface ListeningGraph {
  nodes: Record<SongKey, GraphNode>
  edges: GraphEdge[]
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
  lastfmUrl?: string
  imageUrl?: string
  totalPlays: number
  pageRank: number
  playDates: string[]
  size: number
  color: string
  x: number
  y: number
}

/** Attributes stored on each graphology edge. */
export interface EdgeAttributes {
  weight: number
  /** ISO 8601 timestamps of each individual transition aggregated into this edge. */
  timestamps: string[]
  size: number
  color: string
}
