import { describe, it, expect } from "vitest";
import { computeStats } from "../../../graph-pipeline/src/analysis/stats.js";
import type { ListeningGraph, SongKey, GraphNode } from "../../../graph-pipeline/src/graph/types.js";
import { toSongKey } from "../../../graph-pipeline/src/graph/types.js";

function makeGraph(): ListeningGraph {
    const keyA = toSongKey("Artist A", "Song 1");
    const keyB = toSongKey("Artist B", "Song 2");
    const keyC = toSongKey("Artist C", "Song 3");
    const keyD = toSongKey("Artist A", "Song 4");

    return {
        nodes: {
            [keyA]: {
                name: "Song 1",
                artists: ["Artist A"],
                next: { [keyB]: 3, [keyC]: 1 } as Record<SongKey, number>,
                previous: {} as Record<SongKey, number>,
                totalPlays: 10,
                playDates: [],
            },
            [keyB]: {
                name: "Song 2",
                artists: ["Artist B"],
                next: { [keyC]: 2 } as Record<SongKey, number>,
                previous: { [keyA]: 3 } as Record<SongKey, number>,
                totalPlays: 7,
                playDates: [],
            },
            [keyC]: {
                name: "Song 3",
                artists: ["Artist C"],
                next: { [keyD]: 1 } as Record<SongKey, number>,
                previous: {
                    [keyA]: 1,
                    [keyB]: 2,
                } as Record<SongKey, number>,
                totalPlays: 4,
                playDates: [],
            },
            [keyD]: {
                name: "Song 4",
                artists: ["Artist A"],
                next: {} as Record<SongKey, number>,
                previous: { [keyC]: 1 } as Record<SongKey, number>,
                totalPlays: 1,
                playDates: [],
            },
        } as Record<SongKey, GraphNode>,
        edges: [],
        metadata: {
            totalScrobbles: 22,
            dateRange: {
                from: "2024-01-01T00:00:00Z",
                to: "2024-12-31T00:00:00Z",
            },
            exportTimestamp: "2025-01-15T00:00:00Z",
            lastfmUsername: "testuser",
        },
    };
}

describe("computeStats", () => {
    it("computes correct graph-level stats", () => {
        const graph = makeGraph();
        const result = computeStats(graph);

        expect(result.graphStats.totalNodes).toBe(4);
        // Edges: A→B, A→C, B→C, C→D = 4
        expect(result.graphStats.totalEdges).toBe(4);
        expect(result.graphStats.totalScrobbles).toBe(22);
        expect(result.graphStats.dateRange.from).toBe("2024-01-01T00:00:00Z");
        expect(result.graphStats.dateRange.to).toBe("2024-12-31T00:00:00Z");
    });

    it("computes per-node stats correctly", () => {
        const graph = makeGraph();
        const result = computeStats(graph);

        const keyA = toSongKey("Artist A", "Song 1");
        const statsA = result.nodeStats.get(keyA)!;
        expect(statsA).toBeDefined();
        expect(statsA.inDegree).toBe(0); // no previous edges
        expect(statsA.outDegree).toBe(2); // → B, → C
        expect(statsA.weightedOutDegree).toBe(4); // 3 + 1
        expect(statsA.weightedInDegree).toBe(0);
        expect(statsA.totalDegree).toBe(2);
        expect(statsA.totalPlays).toBe(10);

        const keyC = toSongKey("Artist C", "Song 3");
        const statsC = result.nodeStats.get(keyC)!;
        expect(statsC.inDegree).toBe(2); // ← A, ← B
        expect(statsC.outDegree).toBe(1); // → D
        expect(statsC.weightedInDegree).toBe(3); // 1 + 2
        expect(statsC.weightedOutDegree).toBe(1);
    });

    it("computes average and median degree", () => {
        const graph = makeGraph();
        const result = computeStats(graph);

        // Degrees: A=2, B=2, C=3, D=1 → sorted [1, 2, 2, 3]
        // Average: 8/4 = 2
        expect(result.graphStats.averageDegree).toBe(2);
        // Median of [1, 2, 2, 3] = (2+2)/2 = 2
        expect(result.graphStats.medianDegree).toBe(2);
    });

    it("produces correct rankings", () => {
        const graph = makeGraph();
        const result = computeStats(graph, 2);

        // Most played: A(10), B(7)
        expect(result.rankings.mostPlayed).toHaveLength(2);
        expect(result.rankings.mostPlayed[0]!.totalPlays).toBe(10);
        expect(result.rankings.mostPlayed[1]!.totalPlays).toBe(7);

        // Most connected (total degree): C(3), then A or B (both 2)
        expect(result.rankings.mostConnected[0]!.totalDegree).toBe(3);

        // Highest in-degree: C(2), then B or D (both 1)
        expect(result.rankings.highestInDegree[0]!.inDegree).toBe(2);

        // Highest out-degree: A(2), then B or C (both 1)
        expect(result.rankings.highestOutDegree[0]!.outDegree).toBe(2);
    });

    it("handles empty graph", () => {
        const empty: ListeningGraph = {
            nodes: {} as Record<SongKey, GraphNode>,
            edges: [],
            metadata: {
                totalScrobbles: 0,
                dateRange: { from: "", to: "" },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        const result = computeStats(empty);

        expect(result.graphStats.totalNodes).toBe(0);
        expect(result.graphStats.totalEdges).toBe(0);
        expect(result.graphStats.averageDegree).toBe(0);
        expect(result.graphStats.medianDegree).toBe(0);
        expect(result.rankings.mostPlayed).toHaveLength(0);
    });

    it("respects topN parameter", () => {
        const graph = makeGraph();
        const result = computeStats(graph, 1);

        expect(result.rankings.mostPlayed).toHaveLength(1);
        expect(result.rankings.mostConnected).toHaveLength(1);
    });
});
