import { describe, it, expect } from "vitest";
import { detectClusters } from "./clusters.js";
import type { SongKey } from "../graph/types.js";
import { makeNode, makeGraph } from "../test-helpers.js";

describe("detectClusters", () => {
    it("handles empty graph", () => {
        const graph = makeGraph({});
        const result = detectClusters(graph);

        expect(result.clusterCount).toBe(0);
        expect(result.clusters).toHaveLength(0);
    });

    it("single node gets its own cluster", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ name: "T1" }),
        });

        const result = detectClusters(graph);

        expect(result.clusterCount).toBe(1);
        expect(graph.nodes["a::t1" as SongKey]!.clusterId).toBe(0);
    });

    it("isolated nodes each get their own cluster", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ name: "T1" }),
            "b::t2": makeNode({ name: "T2" }),
            "c::t3": makeNode({ name: "T3" }),
        });

        const result = detectClusters(graph);

        // No edges — each node is its own cluster
        expect(result.clusterCount).toBe(3);
    });

    it("two tightly connected groups form separate clusters", () => {
        // Group 1: A <-> B (weight 10)
        // Group 2: C <-> D (weight 10)
        // Weak cross-link: A -> C (weight 1)
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "T1",
                next: { "b::t2": 10, "c::t3": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "T2",
                next: { "a::t1": 10 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                name: "T3",
                next: { "d::t4": 10 } as Record<SongKey, number>,
            }),
            "d::t4": makeNode({
                name: "T4",
                next: { "c::t3": 10 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        // Should detect 2 clusters
        expect(result.clusterCount).toBe(2);

        // A and B should be in the same cluster
        const clusterA = graph.nodes["a::t1" as SongKey]!.clusterId;
        const clusterB = graph.nodes["b::t2" as SongKey]!.clusterId;
        expect(clusterA).toBe(clusterB);

        // C and D should be in the same cluster
        const clusterC = graph.nodes["c::t3" as SongKey]!.clusterId;
        const clusterD = graph.nodes["d::t4" as SongKey]!.clusterId;
        expect(clusterC).toBe(clusterD);

        // The two groups should be in different clusters
        expect(clusterA).not.toBe(clusterC);
    });

    it("assigns clusterId to every node", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
        });

        detectClusters(graph);

        for (const node of Object.values(graph.nodes)) {
            expect(node.clusterId).toBeDefined();
            expect(typeof node.clusterId).toBe("number");
        }
    });

    it("computes cluster stats with correct sizes", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "T1",
                totalPlays: 5,
                next: { "b::t2": 10 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "T2",
                totalPlays: 3,
                next: { "a::t1": 10 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        // Both in one cluster
        expect(result.clusterCount).toBe(1);
        expect(result.clusters[0]!.size).toBe(2);
    });

    it("top songs are sorted by totalPlays", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                name: "Low",
                totalPlays: 1,
                next: { "b::t2": 5 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                name: "High",
                totalPlays: 100,
                next: { "a::t1": 5 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        expect(result.clusters[0]!.topSongs[0]!.name).toBe("High");
        expect(result.clusters[0]!.topSongs[1]!.name).toBe("Low");
    });

    it("counts inter-cluster edges", () => {
        // A <-> B (same cluster), A -> C (cross-cluster), C <-> D (same cluster)
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 10, "c::t3": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 10 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                next: { "d::t4": 10 } as Record<SongKey, number>,
            }),
            "d::t4": makeNode({
                next: { "c::t3": 10 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        // At least one cluster should have inter-cluster edges > 0
        const totalInterCluster = result.clusters.reduce(
            (sum, c) => sum + c.interClusterEdges,
            0,
        );
        expect(totalInterCluster).toBeGreaterThan(0);
    });

    it("modularity is positive for well-separated clusters", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 10, "c::t3": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 10 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                next: { "d::t4": 10 } as Record<SongKey, number>,
            }),
            "d::t4": makeNode({
                next: { "c::t3": 10 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        // Modularity should be positive for meaningful clustering
        expect(result.modularity).toBeGreaterThan(0);
        // With well-separated clusters, modularity should be close to 0.5
        expect(result.modularity).toBeCloseTo(0.4756, 3);
    });

    it("two-node single-community graph has modularity 0", () => {
        // Two nodes connected, both in one community => Q = L/m - (d/(2m))^2
        // L = 1 (one edge weight 1), m = 1, d = 1+1 = 2
        // Q = 1/1 - (2/2)^2 = 1 - 1 = 0
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 1 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 1 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        expect(result.clusterCount).toBe(1);
        expect(result.modularity).toBeCloseTo(0, 5);
    });

    it("strongly connected group stays together", () => {
        // A <-> B <-> C <-> A (triangle with high weights)
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 5, "c::t3": 5 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 5, "c::t3": 5 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                next: { "a::t1": 5, "b::t2": 5 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        // All three should be in the same cluster
        const clusterA = graph.nodes["a::t1" as SongKey]!.clusterId;
        const clusterB = graph.nodes["b::t2" as SongKey]!.clusterId;
        const clusterC = graph.nodes["c::t3" as SongKey]!.clusterId;
        expect(clusterA).toBe(clusterB);
        expect(clusterB).toBe(clusterC);
    });

    it("self-loop edges are not double-counted", () => {
        // A has a self-loop (A -> A with weight 3) and an edge to B
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "a::t1": 3, "b::t2": 5 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 5 } as Record<SongKey, number>,
            }),
        });

        // Should not crash or produce incorrect clustering
        const result = detectClusters(graph);
        expect(result.clusterCount).toBeGreaterThan(0);

        // Both nodes should have cluster IDs assigned
        expect(graph.nodes["a::t1" as SongKey]!.clusterId).toBeDefined();
        expect(graph.nodes["b::t2" as SongKey]!.clusterId).toBeDefined();
    });

    it("cluster IDs are contiguous starting from 0", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                next: { "b::t2": 10 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                next: { "a::t1": 10 } as Record<SongKey, number>,
            }),
            "c::t3": makeNode({
                next: { "d::t4": 10 } as Record<SongKey, number>,
            }),
            "d::t4": makeNode({
                next: { "c::t3": 10 } as Record<SongKey, number>,
            }),
        });

        const result = detectClusters(graph);

        const ids = new Set<number>();
        for (const node of Object.values(graph.nodes)) {
            ids.add(node.clusterId!);
        }

        // Should be contiguous: {0, 1} or {0} etc.
        const sortedIds = [...ids].sort((a, b) => a - b);
        for (let i = 0; i < sortedIds.length; i++) {
            expect(sortedIds[i]).toBe(i);
        }
    });
});
