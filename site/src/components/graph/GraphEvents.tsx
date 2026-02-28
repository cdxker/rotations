import { useCallback, useEffect, useMemo, useState } from "react"
import { useSigma, useRegisterEvents } from "@react-sigma/core"
import type { NodeAttributes, EdgeAttributes } from "@/lib/graph-api"
import type { FilterState } from "./FilterPanel"

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
            setSelectedNode(externalSelectedKey)
        }
    }, [externalSelectedKey])

    // Get neighbor set for highlighting
    const getNeighborSet = useCallback(
        (nodeKey: string): Set<string> => {
            const graph = sigma.getGraph()
            const neighbors = new Set<string>()
            graph.forEachNeighbor(nodeKey, (neighbor) => {
                neighbors.add(neighbor)
            })
            return neighbors
        },
        [sigma]
    )

    // Get edge set connected to a node
    const getEdgeSet = useCallback(
        (nodeKey: string): Set<string> => {
            const graph = sigma.getGraph()
            const edges = new Set<string>()
            graph.forEachEdge(nodeKey, (edge) => {
                edges.add(edge)
            })
            return edges
        },
        [sigma]
    )

    // Build selected node detail with neighbors
    const buildSelectedNode = useCallback(
        (nodeKey: string): SelectedNode => {
            const graph = sigma.getGraph()
            const attrs = graph.getNodeAttributes(nodeKey) as NodeAttributes

            const neighbors: SelectedNode["neighbors"] = []

            // Outgoing edges
            graph.forEachOutEdge(nodeKey, (_edge, edgeAttrs, _source, target) => {
                if (graph.hasNode(target)) {
                    const targetAttrs = graph.getNodeAttributes(target) as NodeAttributes
                    neighbors.push({
                        key: target,
                        attrs: targetAttrs,
                        weight: (edgeAttrs as EdgeAttributes).weight,
                        direction: "outgoing",
                    })
                }
            })

            // Incoming edges
            graph.forEachInEdge(nodeKey, (_edge, edgeAttrs, source) => {
                if (graph.hasNode(source)) {
                    const sourceAttrs = graph.getNodeAttributes(source) as NodeAttributes
                    neighbors.push({
                        key: source,
                        attrs: sourceAttrs,
                        weight: (edgeAttrs as EdgeAttributes).weight,
                        direction: "incoming",
                    })
                }
            })

            // Sort by weight descending
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
            clickStage: () => {
                setSelectedNode(null)
                onSelectNode(null)
            },
            enterNode: ({ node }) => {
                setHoveredNode(node)
                const graph = sigma.getGraph()
                const attrs = graph.getNodeAttributes(node) as NodeAttributes
                const viewportPos = sigma.graphToViewport({
                    x: graph.getNodeAttribute(node, "x"),
                    y: graph.getNodeAttribute(node, "y"),
                })
                onHoverNode({
                    key: node,
                    label: attrs.label,
                    artists: attrs.artists,
                    totalPlays: attrs.totalPlays,
                    pageRank: attrs.pageRank,
                    x: viewportPos.x,
                    y: viewportPos.y,
                })
            },
            leaveNode: () => {
                setHoveredNode(null)
                onHoverNode(null)
            },
            enterEdge: ({ edge }) => {
                const graph = sigma.getGraph()
                const edgeAttrs = graph.getEdgeAttributes(edge) as EdgeAttributes
                const source = graph.source(edge)
                const target = graph.target(edge)
                const sourceAttrs = graph.getNodeAttributes(source) as NodeAttributes
                const targetAttrs = graph.getNodeAttributes(target) as NodeAttributes
                onHoverEdge({
                    source,
                    target,
                    sourceLabel: sourceAttrs.label,
                    targetLabel: targetAttrs.label,
                    weight: edgeAttrs.weight,
                })
            },
            leaveEdge: () => {
                onHoverEdge(null)
            },
        })
    }, [registerEvents, sigma, buildSelectedNode, onSelectNode, onHoverNode, onHoverEdge])

    // Escape key to deselect
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && selectedNode) {
                setSelectedNode(null)
                onSelectNode(null)
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [selectedNode, onSelectNode])

    // Apply node reducer for highlighting + cluster filtering + path highlighting
    useEffect(() => {
        const activeNode = selectedNode ?? hoveredNode
        const hasClusterFilter = hiddenClusters.size > 0 || focusedCluster !== null
        const hasPath = pathNodes && pathNodes.size > 0

        if (!activeNode && !hasClusterFilter && !hasPath) {
            sigma.setSetting("nodeReducer", null)
            sigma.setSetting("edgeReducer", null)
            return
        }

        const neighbors = activeNode ? getNeighborSet(activeNode) : new Set<string>()
        const connectedEdges = activeNode ? getEdgeSet(activeNode) : new Set<string>()

        sigma.setSetting("nodeReducer", (node, data) => {
            const clusterId = (data as NodeAttributes & typeof data).clusterId ?? 0

            // Hidden clusters: hide entirely
            if (hiddenClusters.has(clusterId)) {
                return { ...data, hidden: true }
            }

            // Active node hover/selection highlighting takes priority
            if (activeNode) {
                if (node === activeNode) {
                    return { ...data, highlighted: true, zIndex: 1 }
                }
                if (neighbors.has(node)) {
                    return { ...data, zIndex: 0 }
                }
                return { ...data, color: "#333", label: "", zIndex: -1 }
            }

            // Path highlighting
            if (hasPath) {
                if (pathNodes.has(node)) {
                    return { ...data, highlighted: true, zIndex: 1 }
                }
                return { ...data, color: "#222", label: "", zIndex: -1 }
            }

            // Focus mode: dim nodes not in the focused cluster
            if (focusedCluster !== null && clusterId !== focusedCluster) {
                return { ...data, color: "#222", label: "", zIndex: -1 }
            }

            if (focusedCluster !== null && clusterId === focusedCluster) {
                return { ...data, zIndex: 1 }
            }

            return data
        })

        sigma.setSetting("edgeReducer", (edge, data) => {
            const graph = sigma.getGraph()
            const source = graph.source(edge)
            const target = graph.target(edge)
            const sourceCluster = (graph.getNodeAttributes(source) as NodeAttributes).clusterId ?? 0
            const targetCluster = (graph.getNodeAttributes(target) as NodeAttributes).clusterId ?? 0

            // Hide edges connected to hidden clusters
            if (hiddenClusters.has(sourceCluster) || hiddenClusters.has(targetCluster)) {
                return { ...data, hidden: true }
            }

            // Active node hover/selection takes priority
            if (activeNode) {
                if (connectedEdges.has(edge)) {
                    return { ...data, color: "rgba(255, 255, 255, 0.4)", zIndex: 1 }
                }
                return { ...data, hidden: true }
            }

            // Path highlighting
            if (hasPath && pathEdges) {
                const edgeKey = `${source}→${target}`
                if (pathEdges.has(edgeKey)) {
                    return { ...data, color: "rgba(255, 255, 255, 0.6)", size: 3, zIndex: 1 }
                }
                return { ...data, hidden: true }
            }

            // Focus mode
            if (focusedCluster !== null) {
                const isIntra = sourceCluster === focusedCluster && targetCluster === focusedCluster
                if (isIntra) {
                    return { ...data, color: "rgba(255, 255, 255, 0.25)", zIndex: 1 }
                }
                return { ...data, hidden: true }
            }

            return data
        })
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
    ])

    // --- Filter logic (merged from GraphFilters) ---

    const pageRankThreshold = useMemo(() => {
        if (filter.minPageRankPct <= 0) return 0

        const graph = sigma.getGraph()
        const pageRanks: number[] = []
        graph.forEachNode((_node, attrs) => {
            pageRanks.push((attrs as NodeAttributes).pageRank)
        })

        if (pageRanks.length === 0) return 0

        pageRanks.sort((a, b) => a - b)
        const idx = Math.floor((filter.minPageRankPct / 100) * pageRanks.length)
        return pageRanks[Math.min(idx, pageRanks.length - 1)]!
    }, [sigma, filter.minPageRankPct])

    useEffect(() => {
        const graph = sigma.getGraph()
        let visibleCount = 0
        let maxPlays = 0
        let maxEdgeWeight = 0

        const hasSourceFilter = filter.activeSources.size > 0
        const visibleNodeSet = new Set<string>()

        graph.forEachNode((node, attrs) => {
            const nodeAttrs = attrs as NodeAttributes
            let hidden = false

            if (filter.minPlays > 0 && nodeAttrs.totalPlays < filter.minPlays) hidden = true
            if (pageRankThreshold > 0 && nodeAttrs.pageRank < pageRankThreshold) hidden = true
            if (hasSourceFilter) {
                const hasMatch = nodeAttrs.sources.some((s) => filter.activeSources.has(s as any))
                if (!hasMatch) hidden = true
            }

            graph.setNodeAttribute(node, "hidden", hidden)

            if (!hidden) {
                visibleCount++
                visibleNodeSet.add(node)
                if (nodeAttrs.totalPlays > maxPlays) maxPlays = nodeAttrs.totalPlays
            }
        })

        graph.forEachEdge((edge, attrs, source, target) => {
            const edgeAttrs = attrs as EdgeAttributes
            let hidden = false

            if (!visibleNodeSet.has(source) || !visibleNodeSet.has(target)) hidden = true
            if (filter.minEdgeWeight > 0 && edgeAttrs.weight < filter.minEdgeWeight) hidden = true

            graph.setEdgeAttribute(edge, "hidden", hidden)

            if (!hidden && edgeAttrs.weight > maxEdgeWeight) maxEdgeWeight = edgeAttrs.weight
        })

        onStatsChange({ visibleNodes: visibleCount, maxPlays, maxEdgeWeight })
        sigma.refresh()
    }, [sigma, filter, pageRankThreshold, onStatsChange])

    return null
}
