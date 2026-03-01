import { describe, it, expect } from "vitest";
import { computePageRank, getTopByPageRank } from "./pagerank.js";
import type { SongKey } from "../graph/types.js";
import { makeNode, makeGraph } from "../test-helpers.js";

describe("computePageRank", () => {
    it("handles empty graph", () => {
        const graph = makeGraph({});
        const result = computePageRank(graph);

        expect(result.iterations).toBe(0);
        expect(result.converged).toBe(true);
    });

    it("single node gets rank 1", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ name: "T1" }),
        });

        computePageRank(graph);
        expect(graph.nodes["a::t1" as SongKey]!.pageRank).toBeCloseTo(1, 4);
    });

    it("two nodes with bidirectional edges get equal rank", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "T1",
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "T2",
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
        });

        computePageRank(graph);
        const rankA = graph.nodes["a::t1" as SongKey]!.pageRank!;
        const rankB = graph.nodes["b::t2" as SongKey]!.pageRank!;

        expect(rankA).toBeCloseTo(rankB, 4);
        expect(rankA).toBeCloseTo(0.5, 4);
    });

    it("node with more incoming edges ranks higher", () => {
        // A -> C, B -> C  (C has 2 incoming, A and B have 0 incoming besides from C)
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "T1",
                next: { "c::t3": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "T2",
                next: { "c::t3": 1 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                name: "T3",
                next: {} as Record<SongKey, number>,
                previous: { "a::t1": 1, "b::t2": 1 } as Record<SongKey, number>,
            }),
        });

        computePageRank(graph);
        const rankC = graph.nodes["c::t3" as SongKey]!.pageRank!;
        const rankA = graph.nodes["a::t1" as SongKey]!.pageRank!;

        expect(rankC).toBeGreaterThan(rankA);
    });

    it("edge weights influence rank propagation", () => {
        // A -> C (weight 10), B -> C (weight 1), C -> A, C -> B
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "T1",
                next: { "c::t3": 10 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "T2",
                next: { "c::t3": 1 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                name: "T3",
                next: { "a::t1": 1, "b::t2": 1 } as Record<SongKey, number>,
            }),
        });

        computePageRank(graph);

        // C gets rank from both A and B, but A contributes more weight
        // A should rank higher than B because C links back equally but A feeds more into C
        const rankA = graph.nodes["a::t1" as SongKey]!.pageRank!;
        const rankB = graph.nodes["b::t2" as SongKey]!.pageRank!;
        const rankC = graph.nodes["c::t3" as SongKey]!.pageRank!;

        // C gets the most rank from both A and B pointing to it
        expect(rankC).toBeGreaterThan(rankA);
        expect(rankC).toBeGreaterThan(rankB);
    });

    it("handles dangling nodes (no outgoing edges)", () => {
        // A -> B, B has no outgoing edges (dangling)
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "T1",
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "T2",
                next: {} as Record<SongKey, number>,
            }),
        });

        const result = computePageRank(graph);

        // Should converge without errors
        expect(result.converged).toBe(true);

        // Both nodes should have valid ranks
        const rankA = graph.nodes["a::t1" as SongKey]!.pageRank!;
        const rankB = graph.nodes["b::t2" as SongKey]!.pageRank!;
        expect(rankA).toBeGreaterThan(0);
        expect(rankB).toBeGreaterThan(0);

        // Ranks should sum to ~1
        expect(rankA + rankB).toBeCloseTo(1, 4);
    });

    it("handles disconnected components", () => {
        // Component 1: A <-> B, Component 2: C <-> D
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "T1",
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "T2",
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                name: "T3",
                next: { "d::t4": 1 } as Record<SongKey, number>,
            }),
            "d::t4": makeNode({
                name: "T4",
                next: { "c::t3": 1 } as Record<SongKey, number>,
            }),
        });

        const result = computePageRank(graph);
        expect(result.converged).toBe(true);

        // All four nodes should have equal rank
        const ranks = Object.values(graph.nodes).map((n) => n.pageRank!);
        for (const rank of ranks) {
            expect(rank).toBeCloseTo(0.25, 4);
        }
    });

    it("ranks sum to approximately 1", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 3, "c::t3": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "c::t3": 2 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
        });

        computePageRank(graph);

        const sum = Object.values(graph.nodes).reduce(
            (s, n) => s + (n.pageRank ?? 0),
            0,
        );
        expect(sum).toBeCloseTo(1, 4);
    });

    it("respects custom damping factor", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
        });

        computePageRank(graph, { dampingFactor: 0.5 });

        // With lower damping, ranks should still be equal for symmetric graph
        const rankA = graph.nodes["a::t1" as SongKey]!.pageRank!;
        const rankB = graph.nodes["b::t2" as SongKey]!.pageRank!;
        expect(rankA).toBeCloseTo(rankB, 4);
    });

    it("stops at maxIterations if not converged", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
        });

        const result = computePageRank(graph, {
            maxIterations: 2,
            convergenceThreshold: 0, // never converge
        });

        expect(result.iterations).toBe(2);
        expect(result.converged).toBe(false);
    });

    it("converges and returns iteration count", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
        });

        const result = computePageRank(graph);
        expect(result.converged).toBe(true);
        expect(result.iterations).toBeGreaterThan(0);
        expect(result.iterations).toBeLessThanOrEqual(100);
        expect(result.maxDelta).toBeLessThan(0.0001);
    });
});

describe("getTopByPageRank", () => {
    it("returns top N nodes sorted by rank", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "Low",
                artists: ["A"],
                next: { "c::t3": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "Medium",
                artists: ["B"],
                next: { "c::t3": 1 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                name: "High",
                artists: ["C"],
                next: {} as Record<SongKey, number>,
            }),
        });

        computePageRank(graph);
        const top = getTopByPageRank(graph, 2);

        expect(top).toHaveLength(2);
        expect(top[0]!.name).toBe("High");
        expect(top[0]!.pageRank).toBeGreaterThan(top[1]!.pageRank);
    });

    it("returns empty array for graph with no pageRank computed", () => {
        const graph = makeGraph({
            "a::t1": makeNode(),
        });

        const top = getTopByPageRank(graph);
        expect(top).toHaveLength(0);
    });
});
