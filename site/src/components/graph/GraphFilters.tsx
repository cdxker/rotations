import { useEffect, useMemo } from "react";
import { useSigma } from "@react-sigma/core";
import type { NodeAttributes, EdgeAttributes } from "@/lib/graph-api";
import type { FilterState } from "./FilterPanel";

interface GraphFiltersProps {
    filter: FilterState;
    onStatsChange: (stats: { visibleNodes: number; maxPlays: number; maxEdgeWeight: number }) => void;
}

/**
 * Applies filter state to the Sigma graph via node/edge hidden attributes.
 * Must be rendered inside a SigmaContainer.
 *
 * Uses graphology node/edge attributes (hidden) rather than Sigma reducers,
 * so it composes cleanly with the highlight reducers in GraphEvents.
 */
export function GraphFilters({ filter, onStatsChange }: GraphFiltersProps) {
    const sigma = useSigma();

    // Compute PageRank threshold from percentile
    const pageRankThreshold = useMemo(() => {
        if (filter.minPageRankPct <= 0) return 0;

        const graph = sigma.getGraph();
        const pageRanks: number[] = [];
        graph.forEachNode((_node, attrs) => {
            pageRanks.push((attrs as NodeAttributes).pageRank);
        });

        if (pageRanks.length === 0) return 0;

        pageRanks.sort((a, b) => a - b);
        const idx = Math.floor((filter.minPageRankPct / 100) * pageRanks.length);
        return pageRanks[Math.min(idx, pageRanks.length - 1)]!;
    }, [sigma, filter.minPageRankPct]);

    // Apply filters by setting hidden attribute on nodes/edges
    useEffect(() => {
        const graph = sigma.getGraph();
        let visibleCount = 0;
        let maxPlays = 0;
        let maxEdgeWeight = 0;

        const hasSourceFilter = filter.activeSources.size > 0;
        const visibleNodes = new Set<string>();

        // Filter nodes
        graph.forEachNode((node, attrs) => {
            const nodeAttrs = attrs as NodeAttributes;
            let hidden = false;

            if (filter.minPlays > 0 && nodeAttrs.totalPlays < filter.minPlays) {
                hidden = true;
            }

            if (pageRankThreshold > 0 && nodeAttrs.pageRank < pageRankThreshold) {
                hidden = true;
            }

            if (hasSourceFilter) {
                const nodeSources = nodeAttrs.sources;
                const hasMatch = nodeSources.some((s) => filter.activeSources.has(s as any));
                if (!hasMatch) hidden = true;
            }

            graph.setNodeAttribute(node, "hidden", hidden);

            if (!hidden) {
                visibleCount++;
                visibleNodes.add(node);
                if (nodeAttrs.totalPlays > maxPlays) maxPlays = nodeAttrs.totalPlays;
            }
        });

        // Filter edges
        graph.forEachEdge((edge, attrs, source, target) => {
            const edgeAttrs = attrs as EdgeAttributes;
            let hidden = false;

            // Hide edges connected to hidden nodes
            if (!visibleNodes.has(source) || !visibleNodes.has(target)) {
                hidden = true;
            }

            // Hide edges below weight threshold
            if (filter.minEdgeWeight > 0 && edgeAttrs.weight < filter.minEdgeWeight) {
                hidden = true;
            }

            graph.setEdgeAttribute(edge, "hidden", hidden);

            if (!hidden && edgeAttrs.weight > maxEdgeWeight) {
                maxEdgeWeight = edgeAttrs.weight;
            }
        });

        onStatsChange({ visibleNodes: visibleCount, maxPlays, maxEdgeWeight });
        sigma.refresh();
    }, [sigma, filter, pageRankThreshold, onStatsChange]);

    return null;
}
