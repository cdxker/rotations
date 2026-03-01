import { describe, it, expect } from "vitest"
import Graph from "graphology"
import { computeDepthLayers } from "./depth-layers"

function makeLinearGraph(): Graph {
    // A -> B -> C -> D -> E (linear chain)
    const g = new Graph()
    for (const n of ["A", "B", "C", "D", "E"]) {
        g.addNode(n)
    }
    g.addEdge("A", "B", { weight: 5 })
    g.addEdge("B", "C", { weight: 3 })
    g.addEdge("C", "D", { weight: 1 })
    g.addEdge("D", "E", { weight: 2 })
    return g
}

function makeBranchingGraph(): Graph {
    //     B
    //    / \
    // A     D - E
    //    \ /
    //     C
    const g = new Graph()
    for (const n of ["A", "B", "C", "D", "E"]) {
        g.addNode(n)
    }
    g.addEdge("A", "B", { weight: 5 })
    g.addEdge("A", "C", { weight: 2 })
    g.addEdge("B", "D", { weight: 3 })
    g.addEdge("C", "D", { weight: 1 })
    g.addEdge("D", "E", { weight: 4 })
    return g
}

describe("computeDepthLayers", () => {
    it("assigns depth 0 to the root node", () => {
        const g = makeLinearGraph()
        const { depths } = computeDepthLayers(g, "A", 3)
        expect(depths.get("A")).toBe(0)
    })

    it("assigns correct depths along a linear chain", () => {
        const g = makeLinearGraph()
        const { depths } = computeDepthLayers(g, "A", 3)
        expect(depths.get("A")).toBe(0)
        expect(depths.get("B")).toBe(1)
        expect(depths.get("C")).toBe(2)
        expect(depths.get("D")).toBe(3)
    })

    it("stops at maxDepth", () => {
        const g = makeLinearGraph()
        const { depths } = computeDepthLayers(g, "A", 2)
        expect(depths.has("A")).toBe(true)
        expect(depths.has("B")).toBe(true)
        expect(depths.has("C")).toBe(true)
        expect(depths.has("D")).toBe(false) // Beyond depth 2
        expect(depths.has("E")).toBe(false)
    })

    it("handles branching graphs correctly", () => {
        const g = makeBranchingGraph()
        const { depths } = computeDepthLayers(g, "A", 3)
        expect(depths.get("A")).toBe(0)
        expect(depths.get("B")).toBe(1)
        expect(depths.get("C")).toBe(1)
        expect(depths.get("D")).toBe(2)
        expect(depths.get("E")).toBe(3)
    })

    it("normalizes weights within each layer", () => {
        const g = makeBranchingGraph()
        const { weights } = computeDepthLayers(g, "A", 3)

        // Root always has weight 1
        expect(weights.get("A")).toBe(1)

        // Layer 1: B has weight 5, C has weight 2 → B=1.0, C=0.4
        expect(weights.get("B")).toBe(1)
        expect(weights.get("C")).toBeCloseTo(0.4)
    })

    it("includes edges between depth-neighborhood nodes", () => {
        const g = makeBranchingGraph()
        const { edges, depths } = computeDepthLayers(g, "A", 3)

        // All edges should be included since all nodes are within depth 3
        expect(edges.size).toBeGreaterThan(0)
        // All 5 nodes should be in the depth map
        expect(depths.size).toBe(5)
    })

    it("returns empty result for missing root node", () => {
        const g = makeLinearGraph()
        const { depths, edges } = computeDepthLayers(g, "MISSING", 3)
        expect(depths.size).toBe(0)
        expect(edges.size).toBe(0)
    })

    it("handles isolated node (no neighbors)", () => {
        const g = new Graph()
        g.addNode("alone")
        const { depths } = computeDepthLayers(g, "alone", 3)
        expect(depths.size).toBe(1)
        expect(depths.get("alone")).toBe(0)
    })

    it("respects depth=1 for standard neighbor view", () => {
        const g = makeBranchingGraph()
        const { depths } = computeDepthLayers(g, "A", 1)
        expect(depths.size).toBe(3) // A, B, C
        expect(depths.has("D")).toBe(false)
        expect(depths.has("E")).toBe(false)
    })
})
