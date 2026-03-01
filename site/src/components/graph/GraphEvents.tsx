import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSigma, useRegisterEvents } from "@react-sigma/core"
import type { NodeAttributes, EdgeAttributes } from "@/lib/graph-api"
import { computeDepthLayers } from "@/lib/depth-layers"
import type { FilterState } from "./FilterPanel"

function graphDebug(...args: unknown[]) {
    if (typeof window === "undefined") return
    console.log("[graph-debug]", ...args)
}

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
    depthMode: boolean
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
    depthMode,
    filter,
    onStatsChange,
}: GraphEventsProps) {
    const sigma = useSigma()
    const registerEvents = useRegisterEvents()
    const [selectedNode, setSelectedNode] = useState<string | null>(null)
    const [hoveredNode, setHoveredNode] = useState<string | null>(null)
    const previousActiveNodeRef = useRef<string | null>(null)

    const summarizeNodeDisplay = useCallback(
        (nodeKey: string | null) => {
            if (!nodeKey) return null
            const d = sigma.getNodeDisplayData(nodeKey)
            if (!d) return null
            return {
                node: nodeKey,
                color: d.color,
                highlighted: !!d.highlighted,
                hidden: !!d.hidden,
                zIndex: d.zIndex ?? null,
                size: d.size,
            }
        },
        [sigma]
    )

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
                graphDebug("sigma clickNode handler", { node })
                setSelectedNode(node)
                onSelectNode(buildSelectedNode(node))
            },
            clickStage: () => {
                // Never deselect — always keep a node focused
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
                    imageUrl: attrs.imageUrl,
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


    // Apply node reducer for highlighting + cluster filtering + path highlighting + depth mode
    useEffect(() => {
        const activeNode = selectedNode ?? hoveredNode
        const previousActiveNode = previousActiveNodeRef.current
        const hasClusterFilter = hiddenClusters.size > 0 || focusedCluster !== null
        const hasPath = pathNodes && pathNodes.size > 0
        graphDebug("reducers: apply", {
            activeNode,
            previousActiveNode,
            externalSelectedKey,
            selectedNode,
            hoveredNode,
            hasClusterFilter,
            hasPath,
            depthMode,
        })

        if (!activeNode && !hasClusterFilter && !hasPath) {
            // Don't clear bootstrap reducers if a selection is in-flight from the parent
            // (externalSelectedKey is set but hasn't propagated to local state yet)
            if (!externalSelectedKey) {
                sigma.setSetting("nodeReducer", null)
                sigma.setSetting("edgeReducer", null)
                sigma.refresh()
            }
            previousActiveNodeRef.current = null
            return
        }

        // Compute depth layers for depth mode, or just direct neighbors for standard mode
        const graph = sigma.getGraph()
        const depthResult =
            depthMode && activeNode
                ? computeDepthLayers(graph, activeNode, 3)
                : null

        const neighbors = activeNode ? getNeighborSet(activeNode) : new Set<string>()
        const connectedEdges = activeNode ? getEdgeSet(activeNode) : new Set<string>()

        // Brightness per depth layer: [root, layer1, layer2, layer3]
        const DEPTH_COLORS = ["#ffffff", "#bbb", "#777", "#444"]
        const DEPTH_EDGE_OPACITY = [0.5, 0.3, 0.15, 0.08]

        sigma.setSetting("nodeReducer", (node, data) => {
            const clusterId = (data as NodeAttributes & typeof data).clusterId ?? 0

            // Hidden clusters: hide entirely
            if (hiddenClusters.has(clusterId)) {
                return { ...data, hidden: true }
            }

            // Depth mode: 3-layer neighborhood with weight-based brightness
            if (depthResult && activeNode) {
                const depth = depthResult.depths.get(node)
                if (depth !== undefined) {
                    const weight = depthResult.weights.get(node) ?? 1
                    const baseColor = DEPTH_COLORS[Math.min(depth, 3)]!
                    if (depth === 0) {
                        return { ...data, color: baseColor, highlighted: true, zIndex: 2 }
                    }
                    // Scale brightness by weight within the layer
                    const rgb = parseInt(baseColor.slice(1), 16)
                    const r = (rgb >> 16) & 0xff
                    const scaled = Math.round(r * (0.5 + 0.5 * weight))
                    const hex = `#${scaled.toString(16).padStart(2, "0").repeat(3)}`
                    return { ...data, color: hex, zIndex: 2 - depth }
                }
                return { ...data, color: "#222", label: "", zIndex: -2 }
            }

            // Standard mode: active node highlighting — monochrome brightness hierarchy
            if (activeNode) {
                if (node === activeNode) {
                    return { ...data, color: "#ffffff", highlighted: true, zIndex: 1 }
                }
                if (neighbors.has(node)) {
                    return { ...data, color: "#999", zIndex: 0 }
                }
                return { ...data, color: "#333", label: "", zIndex: -1 }
            }

            // Path highlighting — monochrome
            if (hasPath) {
                if (pathNodes.has(node)) {
                    return { ...data, color: "#ddd", highlighted: true, zIndex: 1 }
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
            const source = graph.source(edge)
            const target = graph.target(edge)
            const sourceCluster =
                (graph.getNodeAttributes(source) as NodeAttributes).clusterId ?? 0
            const targetCluster =
                (graph.getNodeAttributes(target) as NodeAttributes).clusterId ?? 0

            // Hide edges connected to hidden clusters
            if (hiddenClusters.has(sourceCluster) || hiddenClusters.has(targetCluster)) {
                return { ...data, hidden: true }
            }

            // Depth mode: show edges within the neighborhood with depth-based opacity
            if (depthResult && activeNode) {
                if (depthResult.edges.has(edge)) {
                    const sourceDepth = depthResult.depths.get(source) ?? 3
                    const targetDepth = depthResult.depths.get(target) ?? 3
                    const maxD = Math.max(sourceDepth, targetDepth)
                    const opacity = DEPTH_EDGE_OPACITY[Math.min(maxD, 3)]!
                    return {
                        ...data,
                        color: `rgba(255, 255, 255, ${opacity})`,
                        zIndex: 2 - maxD,
                    }
                }
                return { ...data, hidden: true }
            }

            // Standard mode: active node hover/selection takes priority
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

        sigma.refresh()
        const nextActiveNode = activeNode ?? null
        requestAnimationFrame(() => {
            graphDebug("reducers: post-refresh display", {
                active: summarizeNodeDisplay(nextActiveNode),
                previous: summarizeNodeDisplay(previousActiveNode),
            })
        })
        previousActiveNodeRef.current = nextActiveNode
    }, [
        selectedNode,
        hoveredNode,
        sigma,
        depthMode,
        getNeighborSet,
        getEdgeSet,
        hiddenClusters,
        focusedCluster,
        pathNodes,
        pathEdges,
        summarizeNodeDisplay,
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
