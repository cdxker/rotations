import { useCallback, useEffect, useState } from "react"
import { useSigma, useRegisterEvents } from "@react-sigma/core"
import type { NodeAttributes, EdgeAttributes } from "@/lib/graph-api"
import type { FilterState } from "./FilterPanel"
import { useGraphFilter } from "./useGraphFilter"

export interface SelectedNode {
    key: string
    attrs: NodeAttributes
    neighbors: Array<{
        key: string
        attrs: NodeAttributes
        weight: number
        direction: "incoming" | "outgoing"
    }>
}

export interface HoveredEdge {
    source: string
    target: string
    sourceLabel: string
    targetLabel: string
    weight: number
}

interface GraphEventsProps {
    onSelectNode: (node: SelectedNode | null) => void
    externalSelectedKey: string | null
    onHoverNode: (
        info: {
            key: string
            label: string
            artists: string[]
            totalPlays: number
            pageRank: number
            imageUrl?: string
            x: number
            y: number
        } | null
    ) => void
    onHoverEdge: (info: HoveredEdge | null) => void
    hiddenClusters: Set<number>
    focusedCluster: number | null
    pathNodes?: Set<string>
    pathEdges?: Set<string>
    filter: FilterState
    onStatsChange: (stats: {
        visibleNodes: number
        maxPlays: number
        maxEdgeWeight: number
    }) => void
}

interface NodeClassification {
    color: string
    zIndex: number
    highlighted: boolean
    hidden: boolean
    clearLabel: boolean
}

const HIDDEN: NodeClassification = {
    color: "",
    zIndex: 0,
    highlighted: false,
    hidden: true,
    clearLabel: false,
}
const DEFAULT: NodeClassification = {
    color: "",
    zIndex: 0,
    highlighted: false,
    hidden: false,
    clearLabel: false,
}
const DIMMED: NodeClassification = {
    color: "#222",
    zIndex: -1,
    highlighted: false,
    hidden: false,
    clearLabel: true,
}

/** Classify a node's visual role in the current highlight context. */
function classifyNode(
    node: string,
    clusterId: number,
    activeNode: string | null,
    neighbors: Set<string>,
    hiddenClusters: Set<number>,
    focusedCluster: number | null,
    pathNodes: Set<string> | undefined,
    hasPath: boolean
): NodeClassification {
    if (hiddenClusters.has(clusterId)) return HIDDEN

    // Active node highlighting
    if (activeNode) {
        if (node === activeNode) {
            return {
                color: "#ffffff",
                zIndex: 1,
                highlighted: true,
                hidden: false,
                clearLabel: false,
            }
        }
        if (neighbors.has(node)) {
            return {
                color: "#999",
                zIndex: 0,
                highlighted: false,
                hidden: false,
                clearLabel: false,
            }
        }
        return { color: "#333", zIndex: -1, highlighted: false, hidden: false, clearLabel: true }
    }

    // Path highlighting
    if (hasPath && pathNodes) {
        if (pathNodes.has(node)) {
            return { color: "#ddd", zIndex: 1, highlighted: true, hidden: false, clearLabel: false }
        }
        return DIMMED
    }

    // Focus mode
    if (focusedCluster !== null) {
        if (clusterId !== focusedCluster) return DIMMED
        return { color: "", zIndex: 1, highlighted: false, hidden: false, clearLabel: false }
    }

    return DEFAULT
}

/**
 * Handles Sigma events and applies reducers for node highlighting.
 * Must be rendered inside a SigmaContainer.
 */
export function GraphEvents({
    onSelectNode,
    externalSelectedKey,
    onHoverNode,
    onHoverEdge,
    hiddenClusters,
    focusedCluster,
    pathNodes,
    pathEdges,
    filter,
    onStatsChange,
}: GraphEventsProps) {
    const sigma = useSigma()
    const registerEvents = useRegisterEvents()
    const [selectedNode, setSelectedNode] = useState<string | null>(null)
    const [hoveredNode, setHoveredNode] = useState<string | null>(null)

    // Sync external selection (e.g. auto-focus on load)
    useEffect(() => {
        if (externalSelectedKey !== null) {
            queueMicrotask(() => setSelectedNode(externalSelectedKey))
        }
    }, [externalSelectedKey])

    const getNeighborSet = useCallback(
        (nodeKey: string): Set<string> => {
            const neighbors = new Set<string>()
            sigma.getGraph().forEachNeighbor(nodeKey, (n) => neighbors.add(n))
            return neighbors
        },
        [sigma]
    )

    const getEdgeSet = useCallback(
        (nodeKey: string): Set<string> => {
            const edges = new Set<string>()
            sigma.getGraph().forEachEdge(nodeKey, (e) => edges.add(e))
            return edges
        },
        [sigma]
    )

    const buildSelectedNode = useCallback(
        (nodeKey: string): SelectedNode => {
            const graph = sigma.getGraph()
            const attrs = graph.getNodeAttributes(nodeKey) as NodeAttributes
            const neighbors: SelectedNode["neighbors"] = []

            graph.forEachOutEdge(nodeKey, (_edge, edgeAttrs, _source, target) => {
                if (graph.hasNode(target)) {
                    neighbors.push({
                        key: target,
                        attrs: graph.getNodeAttributes(target) as NodeAttributes,
                        weight: (edgeAttrs as EdgeAttributes).weight,
                        direction: "outgoing",
                    })
                }
            })

            graph.forEachInEdge(nodeKey, (_edge, edgeAttrs, source) => {
                if (graph.hasNode(source)) {
                    neighbors.push({
                        key: source,
                        attrs: graph.getNodeAttributes(source) as NodeAttributes,
                        weight: (edgeAttrs as EdgeAttributes).weight,
                        direction: "incoming",
                    })
                }
            })

            neighbors.sort((a, b) => b.weight - a.weight)
            return { key: nodeKey, attrs, neighbors }
        },
        [sigma]
    )

    // Register Sigma events
    useEffect(() => {
        registerEvents({
            clickNode: ({ node }) => {
                setSelectedNode(node)
                onSelectNode(buildSelectedNode(node))
            },
            clickStage: () => {},
            enterNode: ({ node }) => {
                setHoveredNode(node)
                const graph = sigma.getGraph()
                const attrs = graph.getNodeAttributes(node) as NodeAttributes
                const pos = sigma.graphToViewport({
                    x: graph.getNodeAttribute(node, "x"),
                    y: graph.getNodeAttribute(node, "y"),
                })
                onHoverNode({
                    key: node,
                    label: attrs.label,
                    artists: attrs.artists,
                    totalPlays: attrs.totalPlays,
                    pageRank: attrs.pageRank,
                    imageUrl: attrs.imageUrl,
                    x: pos.x,
                    y: pos.y,
                })
            },
            leaveNode: () => {
                setHoveredNode(null)
                onHoverNode(null)
            },
            enterEdge: ({ edge }) => {
                const graph = sigma.getGraph()
                const ea = graph.getEdgeAttributes(edge) as EdgeAttributes
                const source = graph.source(edge)
                const target = graph.target(edge)
                const sa = graph.getNodeAttributes(source) as NodeAttributes
                const ta = graph.getNodeAttributes(target) as NodeAttributes
                onHoverEdge({
                    source,
                    target,
                    sourceLabel: sa.label,
                    targetLabel: ta.label,
                    weight: ea.weight,
                })
            },
            leaveEdge: () => onHoverEdge(null),
        })
    }, [registerEvents, sigma, buildSelectedNode, onSelectNode, onHoverNode, onHoverEdge])

    // Apply node/edge reducers for highlighting, cluster filtering, path highlighting
    useEffect(() => {
        const activeNode = selectedNode ?? hoveredNode
        const hasClusterFilter = hiddenClusters.size > 0 || focusedCluster !== null
        const hasPath = pathNodes !== undefined && pathNodes.size > 0

        if (!activeNode && !hasClusterFilter && !hasPath) {
            if (!externalSelectedKey) {
                sigma.setSetting("nodeReducer", null)
                sigma.setSetting("edgeReducer", null)
                sigma.refresh()
            }
            return
        }

        const graph = sigma.getGraph()
        const neighbors = activeNode ? getNeighborSet(activeNode) : new Set<string>()
        const connectedEdges = activeNode ? getEdgeSet(activeNode) : new Set<string>()

        sigma.setSetting("nodeReducer", (node, data) => {
            const clusterId = (data as NodeAttributes & typeof data).clusterId ?? 0
            const cls = classifyNode(
                node,
                clusterId,
                activeNode,
                neighbors,
                hiddenClusters,
                focusedCluster,
                pathNodes,
                hasPath
            )
            if (cls.hidden) return { ...data, hidden: true }
            const result = { ...data } as typeof data & Record<string, unknown>
            if (cls.color) result.color = cls.color
            if (cls.highlighted) result.highlighted = true
            if (cls.clearLabel) result.label = ""
            result.zIndex = cls.zIndex
            return result
        })

        sigma.setSetting("edgeReducer", (edge, data) => {
            const source = graph.source(edge)
            const target = graph.target(edge)
            const sc = (graph.getNodeAttributes(source) as NodeAttributes).clusterId ?? 0
            const tc = (graph.getNodeAttributes(target) as NodeAttributes).clusterId ?? 0

            if (hiddenClusters.has(sc) || hiddenClusters.has(tc)) return { ...data, hidden: true }

            if (activeNode) {
                return connectedEdges.has(edge)
                    ? { ...data, color: "rgba(255, 255, 255, 0.4)", zIndex: 1 }
                    : { ...data, hidden: true }
            }

            if (hasPath && pathEdges) {
                return pathEdges.has(`${source}→${target}`)
                    ? { ...data, color: "rgba(255, 255, 255, 0.6)", size: 3, zIndex: 1 }
                    : { ...data, hidden: true }
            }

            if (focusedCluster !== null) {
                return sc === focusedCluster && tc === focusedCluster
                    ? { ...data, color: "rgba(255, 255, 255, 0.25)", zIndex: 1 }
                    : { ...data, hidden: true }
            }

            return data
        })

        sigma.refresh()
    }, [
        selectedNode,
        hoveredNode,
        sigma,
        getNeighborSet,
        getEdgeSet,
        hiddenClusters,
        focusedCluster,
        pathNodes,
        pathEdges,
        externalSelectedKey,
    ])

    useGraphFilter(sigma, filter, onStatsChange)

    return null
}
