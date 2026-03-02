import { useEffect, useMemo } from "react"
import type Sigma from "sigma"
import type { NodeAttributes, EdgeAttributes } from "@/lib/graph-api"
import type { FilterState } from "./FilterPanel"

interface FilterStats {
    visibleNodes: number
    maxPlays: number
    maxEdgeWeight: number
}

/**
 * Applies graph-level filtering (min plays, pageRank percentile,
 * source filter, edge weight) by setting hidden attributes directly
 * on the graphology instance, then reports visibility stats.
 */
export function useGraphFilter(
    sigma: Sigma,
    filter: FilterState,
    onStatsChange: (stats: FilterStats) => void
) {
    const pageRankThreshold = useMemo(() => {
        if (filter.minPageRankPct <= 0) return 0

        const graph = sigma.getGraph()
        const pageRanks: number[] = []
        graph.forEachNode((_node, attrs) => {
            pageRanks.push((attrs as NodeAttributes).pageRank)
        })

        if (pageRanks.length === 0) return 0

        pageRanks.sort((a, b) => a - b)
        const idx = Math.floor((filter.minPageRankPct / 100) * pageRanks.length)
        return pageRanks[Math.min(idx, pageRanks.length - 1)]!
    }, [sigma, filter.minPageRankPct])

    useEffect(() => {
        const graph = sigma.getGraph()
        let visibleCount = 0
        let maxPlays = 0
        let maxEdgeWeight = 0

        const hasSourceFilter = filter.activeSources.size > 0
        const visibleNodeSet = new Set<string>()

        graph.forEachNode((node, attrs) => {
            const nodeAttrs = attrs as NodeAttributes
            let hidden = false

            if (filter.minPlays > 0 && nodeAttrs.totalPlays < filter.minPlays) hidden = true
            if (pageRankThreshold > 0 && nodeAttrs.pageRank < pageRankThreshold) hidden = true
            if (hasSourceFilter) {
                const hasMatch = nodeAttrs.sources.some((s) => filter.activeSources.has(s as any))
                if (!hasMatch) hidden = true
            }

            graph.setNodeAttribute(node, "hidden", hidden)

            if (!hidden) {
                visibleCount++
                visibleNodeSet.add(node)
                if (nodeAttrs.totalPlays > maxPlays) maxPlays = nodeAttrs.totalPlays
            }
        })

        graph.forEachEdge((edge, attrs, source, target) => {
            const edgeAttrs = attrs as EdgeAttributes
            let hidden = false

            if (!visibleNodeSet.has(source) || !visibleNodeSet.has(target)) hidden = true
            if (filter.minEdgeWeight > 0 && edgeAttrs.weight < filter.minEdgeWeight) hidden = true

            graph.setEdgeAttribute(edge, "hidden", hidden)

            if (!hidden && edgeAttrs.weight > maxEdgeWeight) maxEdgeWeight = edgeAttrs.weight
        })

        onStatsChange({ visibleNodes: visibleCount, maxPlays, maxEdgeWeight })
        sigma.refresh()
    }, [sigma, filter, pageRankThreshold, onStatsChange])
}
