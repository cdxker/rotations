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
    pageRank?: number
    clusterId?: number
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

/** Filter criteria for the graph data layer. */
export interface GraphFilter {
    minPlays?: number
    sources?: ListeningSource[]
    clusterIds?: number[]
}

const GRAPH_API_BASE = import.meta.env.PUBLIC_GRAPH_API_URL ?? "http://localhost:3001"

/** Compute a monochrome node color from importance (0–1 scale). Brighter = more important. */
export function nodeBrightness(importance: number): string {
    // Range: 25% (#404040) for least important → 80% (#cccccc) for most important
    const level = Math.round(64 + 140 * Math.max(0, Math.min(1, importance)))
    return `rgb(${level}, ${level}, ${level})`
}

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
    clusterId: number
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

/** In-memory cache for the raw API response. */
let cachedGraph: ListeningGraph | null = null

/** Fetch the full graph from the API. Caches the result in memory. */
export async function fetchGraph(forceRefresh = false): Promise<ListeningGraph> {
    if (cachedGraph && !forceRefresh) {
        return cachedGraph
    }

    const response = await fetch(`${GRAPH_API_BASE}/graph`)
    if (!response.ok) {
        throw new Error(`Failed to fetch graph: ${response.status} ${response.statusText}`)
    }

    const data: ListeningGraph = await response.json()
    cachedGraph = data
    return data
}

/** Clear the cached graph data. */
export function clearGraphCache(): void {
    cachedGraph = null
}

/** A single step in a path result. */
export interface PathStep {
    songKey: string
    name: string
    artists: string[]
    edgeWeight?: number
}

/** Result of a path search between two songs. */
export interface PathResult {
    from: string
    to: string
    found: boolean
    algorithm: "shortest" | "strongest"
    path: PathStep[]
    hops: number
    totalWeight: number
    minEdgeWeight: number
}

/** Fetch a path between two songs from the API. */
export async function fetchPath(
    from: string,
    to: string,
    algorithm: "shortest" | "strongest" = "shortest"
): Promise<PathResult> {
    const params = new URLSearchParams({ from, to, algorithm })
    const response = await fetch(`${GRAPH_API_BASE}/graph/path?${params}`)
    if (!response.ok) {
        throw new Error(`Failed to fetch path: ${response.status} ${response.statusText}`)
    }
    return response.json()
}

/**
 * Filter graph nodes based on criteria.
 * Returns a new ListeningGraph with only matching nodes (and edges between them).
 */
export function filterGraph(graph: ListeningGraph, filter: GraphFilter): ListeningGraph {
    const { minPlays, sources, clusterIds } = filter

    const filteredNodes: Record<string, GraphNode> = {}

    for (const [key, node] of Object.entries(graph.nodes)) {
        if (minPlays !== undefined && node.totalPlays < minPlays) continue
        if (sources?.length && !node.sources.some((s) => sources.includes(s))) continue
        if (
            clusterIds?.length &&
            (node.clusterId === undefined || !clusterIds.includes(node.clusterId))
        )
            continue
        filteredNodes[key] = node
    }

    // Prune edges to only reference nodes that survived filtering
    const filteredKeys = new Set(Object.keys(filteredNodes))
    const prunedNodes: Record<string, GraphNode> = {}

    for (const [key, node] of Object.entries(filteredNodes)) {
        const prunedNext: Record<string, number> = {}
        for (const [toKey, weight] of Object.entries(node.next)) {
            if (filteredKeys.has(toKey)) prunedNext[toKey] = weight
        }

        const prunedPrevious: Record<string, number> = {}
        for (const [fromKey, weight] of Object.entries(node.previous)) {
            if (filteredKeys.has(fromKey)) prunedPrevious[fromKey] = weight
        }

        prunedNodes[key] = {
            ...node,
            next: prunedNext as Record<SongKey, number>,
            previous: prunedPrevious as Record<SongKey, number>,
        }
    }

    return { nodes: prunedNodes as Record<SongKey, GraphNode>, metadata: graph.metadata }
}

/** Compute node radius from play count using log scale. */
export function nodeSize(totalPlays: number, maxPlays: number): number {
    if (maxPlays <= 1) return 4
    return 4 + (16 * Math.log(totalPlays)) / Math.log(maxPlays)
}

/**
 * Convert a ListeningGraph into a graphology Graph instance for Sigma.js.
 *
 * Nodes get attributes for rendering (size from play count, brightness from importance).
 * Edges are directed with weight-based sizing and opacity. Random initial positions are
 * assigned for ForceAtlas2 to arrange.
 */
export function toGraphology(
    listeningGraph: ListeningGraph
): Graph<NodeAttributes, EdgeAttributes> {
    const graph = new Graph<NodeAttributes, EdgeAttributes>()
    const entries = Object.entries(listeningGraph.nodes)

    if (entries.length === 0) return graph

    const maxPlays = Math.max(...entries.map(([, n]) => n.totalPlays), 1)
    const maxPageRank = Math.max(...entries.map(([, n]) => n.pageRank ?? 0), 1e-10)

    // Add nodes — brightness encodes importance (pageRank)
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
            clusterId: node.clusterId ?? 0,
            size: nodeSize(node.totalPlays, maxPlays),
            color: nodeBrightness(importance),
            x: Math.random() * 1000,
            y: Math.random() * 1000,
        })
    }

    // Add edges — opacity encodes weight
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
