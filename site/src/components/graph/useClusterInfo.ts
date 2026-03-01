import { useMemo } from "react"
import type Graph from "graphology"
import type { Attributes } from "graphology-types"

export interface ClusterInfo {
    id: number
    size: number
    label: string
    topSongs: Array<{ key: string; label: string; plays: number }>
}

/**
 * Extract cluster summaries from a graphology graph.
 * Groups nodes by clusterId, computes size, label (most common artist),
 * and top songs (by play count).
 */
export function useClusterInfo(graph: Graph<Attributes> | null): ClusterInfo[] {
    return useMemo(() => {
        if (!graph) return []

        const clusters = new Map<
            number,
            {
                nodes: Array<{ key: string; label: string; plays: number; artists: string[] }>
                artistCounts: Map<string, number>
            }
        >()

        graph.forEachNode((key, attrs) => {
            const clusterId = (attrs.clusterId as number | undefined) ?? 0

            if (!clusters.has(clusterId)) {
                clusters.set(clusterId, { nodes: [], artistCounts: new Map() })
            }

            const cluster = clusters.get(clusterId)!
            cluster.nodes.push({
                key,
                label: (attrs.label as string) ?? key,
                plays: (attrs.totalPlays as number) ?? 0,
                artists: (attrs.artists as string[]) ?? [],
            })

            for (const artist of (attrs.artists as string[]) ?? []) {
                cluster.artistCounts.set(artist, (cluster.artistCounts.get(artist) ?? 0) + 1)
            }
        })

        const result: ClusterInfo[] = []

        for (const [id, data] of clusters) {
            // Find most common artist for label
            let topArtist = "Unknown"
            let topArtistCount = 0
            for (const [artist, count] of data.artistCounts) {
                if (count > topArtistCount) {
                    topArtist = artist
                    topArtistCount = count
                }
            }

            // Top songs by play count
            const topSongs = data.nodes
                .sort((a, b) => b.plays - a.plays)
                .slice(0, 3)
                .map(({ key, label, plays }) => ({ key, label, plays }))

            result.push({
                id,
                size: data.nodes.length,
                label: topArtist,
                topSongs,
            })
        }

        // Sort by size descending
        result.sort((a, b) => b.size - a.size)

        return result
    }, [graph])
}
