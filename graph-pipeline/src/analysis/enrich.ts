import { writeFile } from "node:fs/promises";
import type { ListeningGraph } from "../graph/types.js";
import { computePageRank, getTopByPageRank } from "./pagerank.js";
import type { PageRankResult } from "./pagerank.js";
import { computeStats } from "./stats.js";
import type { GraphStats, Rankings } from "./stats.js";
import { detectClusters } from "./clusters.js";
import type { ClusterResult } from "./clusters.js";

/** Summary of all analysis results, suitable for API responses and JSON export. */
export interface AnalysisSummary {
    pageRank: PageRankResult & {
        topSongs: ReturnType<typeof getTopByPageRank>;
    };
    stats: GraphStats;
    rankings: Rankings;
    clusters: ClusterResult;
}

/** Result of enriching a graph. */
export interface EnrichResult {
    graph: ListeningGraph;
    summary: AnalysisSummary;
}

/**
 * Run all analysis on a ListeningGraph and attach results to nodes.
 *
 * Mutates the graph in place:
 * - Sets `pageRank` on each node
 * - Sets `clusterId` on each node
 *
 * Returns the enriched graph plus an analysis summary with graph-level
 * stats, rankings, cluster summaries, and PageRank metadata.
 */
export function enrichGraph(
    graph: ListeningGraph,
    options?: { topN?: number; maxTopSongsPerCluster?: number },
): EnrichResult {
    const topN = options?.topN ?? 20;
    const maxTopSongs = options?.maxTopSongsPerCluster ?? 5;

    // Run PageRank (mutates graph — sets pageRank on each node)
    const pageRankResult = computePageRank(graph);
    const topByPageRank = getTopByPageRank(graph, topN);

    // Run cluster detection (mutates graph — sets clusterId on each node)
    const clusterResult = detectClusters(graph, maxTopSongs);

    // Compute stats (read-only)
    const statsResult = computeStats(graph, topN);

    const summary: AnalysisSummary = {
        pageRank: {
            ...pageRankResult,
            topSongs: topByPageRank,
        },
        stats: statsResult.graphStats,
        rankings: statsResult.rankings,
        clusters: clusterResult,
    };

    return { graph, summary };
}

/**
 * Export an enriched graph and its analysis summary to a JSON file.
 */
export async function exportEnrichedGraph(
    result: EnrichResult,
    outputPath: string,
): Promise<void> {
    const output = {
        graph: result.graph,
        analysis: result.summary,
    };
    await writeFile(outputPath, JSON.stringify(output, null, 2));
}
