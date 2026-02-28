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

/** Cluster color palette matching chart-1 through chart-5 CSS variables (dark mode). */
const CLUSTER_COLORS = [
    "#7C3AED", // chart-1: purple
    "#22D3EE", // chart-2: cyan
    "#F59E0B", // chart-3: orange-yellow
    "#A855F7", // chart-4: lighter purple
    "#EF4444", // chart-5: red
]

export function getClusterColor(clusterId: number): string {
    return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length]!
}

/** Attributes stored on each graphology node. */
export interface NodeAttributes {
    label: string
    artists: string[]
    albumName?: string
    spotifyId?: string
    lastfmUrl?: string
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
 * Nodes get attributes for rendering (size from play count, color from cluster, etc.).
 * Edges are directed with weight-based sizing. Random initial positions are assigned
 * for ForceAtlas2 to arrange.
 */
export function toGraphology(
    listeningGraph: ListeningGraph
): Graph<NodeAttributes, EdgeAttributes> {
    const graph = new Graph<NodeAttributes, EdgeAttributes>()
    const entries = Object.entries(listeningGraph.nodes)

    if (entries.length === 0) return graph

    const maxPlays = Math.max(...entries.map(([, n]) => n.totalPlays), 1)

    // Add nodes
    for (const [key, node] of entries) {
        graph.addNode(key, {
            label: `${node.artists[0] ?? "Unknown"} — ${node.name}`,
            artists: node.artists,
            albumName: node.albumName,
            spotifyId: node.spotifyId,
            lastfmUrl: node.lastfmUrl,
            totalPlays: node.totalPlays,
            sources: node.sources,
            pageRank: node.pageRank ?? 0,
            clusterId: node.clusterId ?? 0,
            size: nodeSize(node.totalPlays, maxPlays),
            color: getClusterColor(node.clusterId ?? 0),
            x: Math.random() * 1000,
            y: Math.random() * 1000,
        })
    }

    // Add edges (directed: from → to using the `next` map)
    // Inter-cluster edges are thinner and more transparent than intra-cluster edges
    for (const [fromKey, node] of entries) {
        const fromCluster = listeningGraph.nodes[fromKey as SongKey]?.clusterId ?? 0

        for (const [toKey, weight] of Object.entries(node.next)) {
            if (!graph.hasNode(toKey)) continue
            if (graph.hasEdge(fromKey, toKey)) continue

            const toCluster = listeningGraph.nodes[toKey as SongKey]?.clusterId ?? 0
            const isInterCluster = fromCluster !== toCluster

            graph.addDirectedEdge(fromKey, toKey, {
                weight,
                size: isInterCluster
                    ? Math.max(0.3, Math.min(1.5, Math.log(weight + 1) * 0.5))
                    : Math.max(0.5, Math.min(3, Math.log(weight + 1))),
                color: isInterCluster
                    ? `rgba(255, 255, 255, ${Math.min(0.1, 0.02 + weight * 0.01)})`
                    : `rgba(255, 255, 255, ${Math.min(0.3, 0.05 + weight * 0.03)})`,
            })
        }
    }

    return graph
}
