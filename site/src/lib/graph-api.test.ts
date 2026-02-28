import { describe, it, expect, beforeEach, vi } from "vitest"
import {
    filterGraph,
    toGraphology,
    clearGraphCache,
    fetchGraph,
    getClusterColor,
} from "./graph-api"
import type { ListeningGraph, SongKey, GraphNode } from "./graph-api"

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
    return {
        name: "Test",
        artists: ["Artist"],
        next: {} as Record<SongKey, number>,
        previous: {} as Record<SongKey, number>,
        totalPlays: 1,
        sources: ["lastfm"],
        ...overrides,
    }
}

function makeGraph(nodes: Record<string, GraphNode>): ListeningGraph {
    return {
        nodes: nodes as Record<SongKey, GraphNode>,
        metadata: {
            totalScrobbles: 0,
            dateRange: { from: "2024-01-01", to: "2024-12-31" },
            exportTimestamp: "2024-12-31T00:00:00Z",
        },
    }
}

describe("filterGraph", () => {
    it("returns all nodes when no filter is applied", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ totalPlays: 5 }),
            "b::t2": makeNode({ totalPlays: 10 }),
        })

        const result = filterGraph(graph, {})
        expect(Object.keys(result.nodes)).toHaveLength(2)
    })

    it("filters by minimum play count", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ totalPlays: 2 }),
            "b::t2": makeNode({ totalPlays: 10 }),
            "c::t3": makeNode({ totalPlays: 5 }),
        })

        const result = filterGraph(graph, { minPlays: 5 })
        expect(Object.keys(result.nodes)).toHaveLength(2)
        expect(result.nodes["b::t2" as SongKey]).toBeDefined()
        expect(result.nodes["c::t3" as SongKey]).toBeDefined()
        expect(result.nodes["a::t1" as SongKey]).toBeUndefined()
    })

    it("filters by source", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ sources: ["lastfm"] }),
            "b::t2": makeNode({ sources: ["spotify-recent"] }),
            "c::t3": makeNode({ sources: ["lastfm", "spotify-playlist"] }),
        })

        const result = filterGraph(graph, { sources: ["spotify-recent"] })
        expect(Object.keys(result.nodes)).toHaveLength(1)
        expect(result.nodes["b::t2" as SongKey]).toBeDefined()
    })

    it("filters by cluster ID", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ clusterId: 0 }),
            "b::t2": makeNode({ clusterId: 1 }),
            "c::t3": makeNode({ clusterId: 0 }),
        })

        const result = filterGraph(graph, { clusterIds: [0] })
        expect(Object.keys(result.nodes)).toHaveLength(2)
    })

    it("prunes edges to removed nodes", () => {
        const graph = makeGraph({
            "a::t1": makeNode({
                totalPlays: 10,
                next: { "b::t2": 5 } as Record<SongKey, number>,
            }),
            "b::t2": makeNode({
                totalPlays: 1,
                previous: { "a::t1": 5 } as Record<SongKey, number>,
            }),
        })

        const result = filterGraph(graph, { minPlays: 5 })
        // Only a::t1 survives; its edge to b::t2 should be pruned
        expect(Object.keys(result.nodes)).toHaveLength(1)
        expect(Object.keys(result.nodes["a::t1" as SongKey]!.next)).toHaveLength(0)
    })

    it("combines multiple filters", () => {
        const graph = makeGraph({
            "a::t1": makeNode({ totalPlays: 10, sources: ["lastfm"], clusterId: 0 }),
            "b::t2": makeNode({ totalPlays: 10, sources: ["spotify-recent"], clusterId: 0 }),
            "c::t3": makeNode({ totalPlays: 1, sources: ["lastfm"], clusterId: 0 }),
        })

        const result = filterGraph(graph, { minPlays: 5, sources: ["lastfm"] })
        expect(Object.keys(result.nodes)).toHaveLength(1)
        expect(result.nodes["a::t1" as SongKey]).toBeDefined()
    })
})

describe("toGraphology", () => {
    it("returns empty graph for empty input", () => {
        const graph = toGraphology(makeGraph({}))
        expect(graph.order).toBe(0)
        expect(graph.size).toBe(0)
    })

    it("creates nodes with correct attributes", () => {
        const graph = toGraphology(
            makeGraph({
                "a::t1": makeNode({
                    name: "Song1",
                    artists: ["ArtistA"],
                    totalPlays: 42,
                    pageRank: 0.05,
                    clusterId: 2,
                }),
            })
        )

        expect(graph.order).toBe(1)
        const attrs = graph.getNodeAttributes("a::t1")
        expect(attrs.label).toBe("ArtistA — Song1")
        expect(attrs.totalPlays).toBe(42)
        expect(attrs.pageRank).toBe(0.05)
        expect(attrs.clusterId).toBe(2)
        expect(attrs.size).toBeGreaterThan(0)
        expect(attrs.color).toBeDefined()
        expect(typeof attrs.x).toBe("number")
        expect(typeof attrs.y).toBe("number")
    })

    it("creates directed edges from next map", () => {
        const graph = toGraphology(
            makeGraph({
                "a::t1": makeNode({
                    next: { "b::t2": 5 } as Record<SongKey, number>,
                }),
                "b::t2": makeNode({
                    previous: { "a::t1": 5 } as Record<SongKey, number>,
                }),
            })
        )

        expect(graph.order).toBe(2)
        expect(graph.size).toBe(1)
        expect(graph.hasDirectedEdge("a::t1", "b::t2")).toBe(true)
        expect(graph.hasDirectedEdge("b::t2", "a::t1")).toBe(false)
    })

    it("sets edge weight and size", () => {
        const graph = toGraphology(
            makeGraph({
                "a::t1": makeNode({
                    next: { "b::t2": 10 } as Record<SongKey, number>,
                }),
                "b::t2": makeNode(),
            })
        )

        const edge = graph.edge("a::t1", "b::t2")!
        const attrs = graph.getEdgeAttributes(edge)
        expect(attrs.weight).toBe(10)
        expect(attrs.size).toBeGreaterThan(0)
    })

    it("scales node size by play count", () => {
        const graph = toGraphology(
            makeGraph({
                "a::t1": makeNode({ totalPlays: 1 }),
                "b::t2": makeNode({ totalPlays: 100 }),
            })
        )

        const sizeA = graph.getNodeAttribute("a::t1", "size")
        const sizeB = graph.getNodeAttribute("b::t2", "size")
        expect(sizeB).toBeGreaterThan(sizeA)
    })

    it("skips edges to nodes not in the graph", () => {
        const graph = toGraphology(
            makeGraph({
                "a::t1": makeNode({
                    next: { "missing::node": 5 } as Record<SongKey, number>,
                }),
            })
        )

        expect(graph.order).toBe(1)
        expect(graph.size).toBe(0)
    })

    it("handles nodes without pageRank or clusterId", () => {
        const graph = toGraphology(
            makeGraph({
                "a::t1": makeNode(),
            })
        )

        const attrs = graph.getNodeAttributes("a::t1")
        expect(attrs.pageRank).toBe(0)
        expect(attrs.clusterId).toBe(0)
    })

    it("handles multiple edges between different nodes", () => {
        const graph = toGraphology(
            makeGraph({
                "a::t1": makeNode({
                    next: { "b::t2": 3, "c::t3": 7 } as Record<SongKey, number>,
                }),
                "b::t2": makeNode(),
                "c::t3": makeNode(),
            })
        )

        expect(graph.size).toBe(2)
        expect(graph.getEdgeAttribute(graph.edge("a::t1", "b::t2")!, "weight")).toBe(3)
        expect(graph.getEdgeAttribute(graph.edge("a::t1", "c::t3")!, "weight")).toBe(7)
    })
})

describe("getClusterColor", () => {
    it("returns a color string for valid cluster IDs", () => {
        expect(getClusterColor(0)).toBe("#7C3AED")
        expect(getClusterColor(1)).toBe("#22D3EE")
    })

    it("cycles colors for cluster IDs beyond the palette size", () => {
        expect(getClusterColor(5)).toBe(getClusterColor(0))
        expect(getClusterColor(6)).toBe(getClusterColor(1))
    })
})

describe("fetchGraph", () => {
    beforeEach(() => {
        clearGraphCache()
        vi.restoreAllMocks()
    })

    it("fetches from the API and caches", async () => {
        const mockGraph = makeGraph({ "a::t1": makeNode() })
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(JSON.stringify(mockGraph), { status: 200 }))

        const result = await fetchGraph()
        expect(result.nodes["a::t1" as SongKey]).toBeDefined()
        expect(fetchSpy).toHaveBeenCalledTimes(1)

        // Second call should use cache
        const result2 = await fetchGraph()
        expect(result2).toBe(result)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it("re-fetches when forceRefresh is true", async () => {
        const mockGraph = makeGraph({ "a::t1": makeNode() })
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(() =>
                Promise.resolve(new Response(JSON.stringify(mockGraph), { status: 200 }))
            )

        await fetchGraph()
        await fetchGraph(true)
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it("throws on non-OK response", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("Not Found", { status: 404, statusText: "Not Found" })
        )

        await expect(fetchGraph()).rejects.toThrow("Failed to fetch graph: 404 Not Found")
    })
})
