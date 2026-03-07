import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { enrichGraph, exportEnrichedGraph } from "../../../graph-server/src/analysis/enrich.js";
import type { ListeningGraph, SongKey, GraphNode } from "../../../graph-server/src/graph/types.js";
import { toSongKey } from "../../../graph-server/src/graph/types.js";

function makeTestGraph(): ListeningGraph {
    const keyA = toSongKey("Artist A", "Song 1");
    const keyB = toSongKey("Artist B", "Song 2");
    const keyC = toSongKey("Artist C", "Song 3");

    return {
        nodes: {
            [keyA]: {
                name: "Song 1",
                artists: ["Artist A"],
                albumName: "Album 1",
                next: { [keyB]: 3, [keyC]: 1 } as Record<SongKey, number>,
                previous: {} as Record<SongKey, number>,
                totalPlays: 10,
                sources: ["lastfm"],
            },
            [keyB]: {
                name: "Song 2",
                artists: ["Artist B"],
                next: { [keyC]: 2 } as Record<SongKey, number>,
                previous: { [keyA]: 3 } as Record<SongKey, number>,
                totalPlays: 7,
                sources: ["lastfm", "spotify-recent"],
            },
            [keyC]: {
                name: "Song 3",
                artists: ["Artist C"],
                next: {} as Record<SongKey, number>,
                previous: {
                    [keyA]: 1,
                    [keyB]: 2,
                } as Record<SongKey, number>,
                totalPlays: 3,
                sources: ["spotify-playlist"],
            },
        } as Record<SongKey, GraphNode>,
        metadata: {
            totalScrobbles: 20,
            dateRange: {
                from: "2024-01-01T00:00:00Z",
                to: "2024-12-31T00:00:00Z",
            },
            exportTimestamp: "2025-01-15T00:00:00Z",
            lastfmUsername: "testuser",
        },
    };
}

describe("enrichGraph", () => {
    it("attaches pageRank to every node", () => {
        const graph = makeTestGraph();
        const { graph: enriched } = enrichGraph(graph);

        for (const node of Object.values(enriched.nodes)) {
            expect(node.pageRank).toBeDefined();
            expect(typeof node.pageRank).toBe("number");
            expect(node.pageRank).toBeGreaterThan(0);
        }
    });

    it("attaches clusterId to every node", () => {
        const graph = makeTestGraph();
        const { graph: enriched } = enrichGraph(graph);

        for (const node of Object.values(enriched.nodes)) {
            expect(node.clusterId).toBeDefined();
            expect(typeof node.clusterId).toBe("number");
        }
    });

    it("returns analysis summary with all sections", () => {
        const graph = makeTestGraph();
        const { summary } = enrichGraph(graph);

        // PageRank section
        expect(summary.pageRank.converged).toBe(true);
        expect(summary.pageRank.iterations).toBeGreaterThan(0);
        expect(summary.pageRank.topSongs.length).toBeGreaterThan(0);

        // Stats section
        expect(summary.stats.totalNodes).toBe(3);
        expect(summary.stats.totalEdges).toBe(3);
        expect(summary.stats.totalScrobbles).toBe(20);

        // Rankings section
        expect(summary.rankings.mostPlayed.length).toBeGreaterThan(0);
        expect(summary.rankings.mostPlayed[0]!.totalPlays).toBe(10);

        // Clusters section
        expect(summary.clusters.clusterCount).toBeGreaterThan(0);
    });

    it("handles empty graph", () => {
        const empty: ListeningGraph = {
            nodes: {} as Record<SongKey, GraphNode>,
            metadata: {
                totalScrobbles: 0,
                dateRange: { from: "", to: "" },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        const { summary } = enrichGraph(empty);
        expect(summary.stats.totalNodes).toBe(0);
        expect(summary.clusters.clusterCount).toBe(0);
        expect(summary.pageRank.iterations).toBe(0);
    });
});

describe("exportEnrichedGraph", () => {
    it("writes enriched graph to JSON file", async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), "enrich-test-"));
        const outputPath = join(tmpDir, "enriched.json");

        try {
            const graph = makeTestGraph();
            const result = enrichGraph(graph);
            await exportEnrichedGraph(result, outputPath);

            const raw = readFileSync(outputPath, "utf-8");
            const parsed = JSON.parse(raw);

            expect(parsed.graph).toBeDefined();
            expect(parsed.graph.nodes).toBeDefined();
            expect(parsed.graph.metadata).toBeDefined();
            expect(parsed.analysis).toBeDefined();
            expect(parsed.analysis.pageRank).toBeDefined();
            expect(parsed.analysis.stats).toBeDefined();
            expect(parsed.analysis.rankings).toBeDefined();
            expect(parsed.analysis.clusters).toBeDefined();
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
