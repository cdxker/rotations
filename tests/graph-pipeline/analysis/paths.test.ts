import { describe, it, expect } from "vitest";
import { shortestPath, strongestPath } from "../../../graph-pipeline/src/analysis/paths.js";
import type { SongKey } from "../../../graph-pipeline/src/graph/types.js";
import { buildTestGraph } from "../test-helpers.js";

describe("shortestPath", () => {
    it("finds direct one-hop path", () => {
        const graph = buildTestGraph([["a::x", "b::y", 5]]);
        const result = shortestPath(
            graph,
            "a::x" as SongKey,
            "b::y" as SongKey,
        );
        expect(result.found).toBe(true);
        expect(result.hops).toBe(1);
        expect(result.path).toHaveLength(2);
        expect(result.path[0]!.songKey).toBe("a::x");
        expect(result.path[1]!.songKey).toBe("b::y");
        expect(result.path[0]!.edgeWeight).toBe(5);
    });

    it("finds multi-hop shortest path", () => {
        // a -> b -> c -> d (short)
        // a -> e -> f -> g -> h -> d (long)
        const graph = buildTestGraph([
            ["a::1", "b::2", 1],
            ["b::2", "c::3", 1],
            ["c::3", "d::4", 1],
            ["a::1", "e::5", 10],
            ["e::5", "f::6", 10],
            ["f::6", "g::7", 10],
            ["g::7", "h::8", 10],
            ["h::8", "d::4", 10],
        ]);
        const result = shortestPath(
            graph,
            "a::1" as SongKey,
            "d::4" as SongKey,
        );
        expect(result.found).toBe(true);
        expect(result.hops).toBe(3); // a->b->c->d
    });

    it("returns not found for disconnected nodes", () => {
        const graph = buildTestGraph([
            ["a::1", "b::2", 1],
            ["c::3", "d::4", 1],
        ]);
        const result = shortestPath(
            graph,
            "a::1" as SongKey,
            "d::4" as SongKey,
        );
        expect(result.found).toBe(false);
        expect(result.path).toHaveLength(0);
    });

    it("handles same start and end", () => {
        const graph = buildTestGraph([["a::1", "b::2", 1]]);
        const result = shortestPath(
            graph,
            "a::1" as SongKey,
            "a::1" as SongKey,
        );
        expect(result.found).toBe(true);
        expect(result.hops).toBe(0);
        expect(result.path).toHaveLength(1);
    });

    it("returns not found for missing nodes", () => {
        const graph = buildTestGraph([["a::1", "b::2", 1]]);
        const result = shortestPath(
            graph,
            "a::1" as SongKey,
            "z::z" as SongKey,
        );
        expect(result.found).toBe(false);
    });

    it("respects directed edges", () => {
        // a -> b exists but b -> a does not
        const graph = buildTestGraph([["a::1", "b::2", 1]]);
        const result = shortestPath(
            graph,
            "b::2" as SongKey,
            "a::1" as SongKey,
        );
        expect(result.found).toBe(false);
    });
});

describe("strongestPath", () => {
    it("finds direct path", () => {
        const graph = buildTestGraph([["a::x", "b::y", 5]]);
        const result = strongestPath(
            graph,
            "a::x" as SongKey,
            "b::y" as SongKey,
        );
        expect(result.found).toBe(true);
        expect(result.hops).toBe(1);
        expect(result.minEdgeWeight).toBe(5);
    });

    it("prefers path with higher minimum edge weight", () => {
        // Path 1: a -> b -> d, weights [1, 1] → min = 1
        // Path 2: a -> c -> d, weights [5, 3] → min = 3 (stronger)
        const graph = buildTestGraph([
            ["a::1", "b::2", 1],
            ["b::2", "d::4", 1],
            ["a::1", "c::3", 5],
            ["c::3", "d::4", 3],
        ]);
        const result = strongestPath(
            graph,
            "a::1" as SongKey,
            "d::4" as SongKey,
        );
        expect(result.found).toBe(true);
        expect(result.minEdgeWeight).toBe(3); // Via c, not b
        expect(result.path[1]!.songKey).toBe("c::3");
    });

    it("returns not found for disconnected nodes", () => {
        const graph = buildTestGraph([
            ["a::1", "b::2", 1],
            ["c::3", "d::4", 1],
        ]);
        const result = strongestPath(
            graph,
            "a::1" as SongKey,
            "d::4" as SongKey,
        );
        expect(result.found).toBe(false);
    });

    it("handles same start and end", () => {
        const graph = buildTestGraph([["a::1", "b::2", 1]]);
        const result = strongestPath(
            graph,
            "a::1" as SongKey,
            "a::1" as SongKey,
        );
        expect(result.found).toBe(true);
        expect(result.hops).toBe(0);
    });

    it("computes totalWeight correctly", () => {
        const graph = buildTestGraph([
            ["a::1", "b::2", 3],
            ["b::2", "c::3", 7],
        ]);
        const result = strongestPath(
            graph,
            "a::1" as SongKey,
            "c::3" as SongKey,
        );
        expect(result.found).toBe(true);
        expect(result.totalWeight).toBe(10);
        expect(result.minEdgeWeight).toBe(3);
    });
});
