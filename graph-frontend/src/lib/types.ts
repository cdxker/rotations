/** Canonical song identity: `lowercase(artist)::lowercase(track_name)`. */
export type SongKey = `${string}::${string}`

/** Data source that contributed a scrobble or track ordering. */
export type ListeningSource = "lastfm"

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
  sources: ListeningSource[]
  pageRank: number
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
  lastfmUrl?: string
  imageUrl?: string
  totalPlays: number
  sources: string[]
  pageRank: number
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
