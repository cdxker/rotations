import { useCallback, useEffect, useMemo, useState } from "react"
import { SigmaContainer, useLoadGraph, useSigma } from "@react-sigma/core"
import "@react-sigma/core/lib/style.css"
import { useGraphData } from "./graph/useGraphData"
import { GraphEvents } from "./graph/GraphEvents"
import type { SelectedNode, HoveredEdge } from "./graph/GraphEvents"
import { NodeDetailPanel } from "./graph/NodeDetailPanel"
import { useClusterInfo } from "./graph/useClusterInfo"
import { ClusterLegend } from "./graph/ClusterLegend"
import { SearchBarInner } from "./graph/SearchBar"
import { FilterPanel, DEFAULT_FILTER } from "./graph/FilterPanel"
import type { FilterState } from "./graph/FilterPanel"
import { SlidersHorizontal, Route } from "lucide-react"
import { PathPanel } from "./graph/PathPanel"
import type { PathModeState } from "./graph/PathPanel"

/** Load graph data into Sigma and run ForceAtlas2 layout. */
function GraphInner({
    onSelectNode,
    selectedNode,
    onHoverNode,
    onHoverEdge,
    onMouseMove,
    hiddenClusters,
    focusedCluster,
    pathNodes,
    pathEdges,
    filter,
    onStatsChange,
}: {
    onSelectNode: (node: SelectedNode | null) => void
    selectedNode: SelectedNode | null
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
    onMouseMove: (pos: { x: number; y: number }) => void
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
}) {
    const { graph, state, error } = useGraphData()
    const loadGraph = useLoadGraph()
    const sigma = useSigma()

    // Track mouse position for edge tooltip
    useEffect(() => {
        const container = sigma.getContainer()
        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect()
            onMouseMove({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }
        container.addEventListener("mousemove", handleMouseMove)
        return () => container.removeEventListener("mousemove", handleMouseMove)
    }, [sigma, onMouseMove])

    // Load graph into Sigma when data is ready, auto-focus a random node
    useEffect(() => {
        if (!graph) return
        loadGraph(graph)

        // Pick a random node to focus on load
        const nodes = graph.nodes()
        if (nodes.length > 0) {
            const randomKey = nodes[Math.floor(Math.random() * nodes.length)]!
            const attrs = graph.getNodeAttributes(randomKey) as any
            const neighbors: SelectedNode["neighbors"] = []
            graph.forEachOutEdge(randomKey, (_edge, edgeAttrs, _source, target) => {
                if (graph.hasNode(target)) {
                    neighbors.push({
                        key: target,
                        attrs: graph.getNodeAttributes(target) as any,
                        weight: edgeAttrs.weight,
                        direction: "outgoing",
                    })
                }
            })
            graph.forEachInEdge(randomKey, (_edge, edgeAttrs, source) => {
                if (graph.hasNode(source)) {
                    neighbors.push({
                        key: source,
                        attrs: graph.getNodeAttributes(source) as any,
                        weight: edgeAttrs.weight,
                        direction: "incoming",
                    })
                }
            })
            neighbors.sort((a, b) => b.weight - a.weight)
            onSelectNode({ key: randomKey, attrs, neighbors })
        }
    }, [graph])

    // Configure Sigma settings for dark theme
    useEffect(() => {
        sigma.setSetting("defaultNodeColor", "#666")
        sigma.setSetting("defaultEdgeColor", "rgba(255,255,255,0.08)")
        sigma.setSetting("labelColor", { color: "rgba(255,255,255,0.8)" })
        sigma.setSetting("labelFont", "DM Mono, monospace")
        sigma.setSetting("labelSize", 11)
        sigma.setSetting("labelRenderedSizeThreshold", 8)
        sigma.setSetting("enableEdgeEvents", true)
    }, [sigma])

    // Status indicator
    if (state === "loading") {
        return (
            <div className="absolute inset-0 flex items-center justify-center z-10">
                <p className="text-white/60 text-sm font-mono">Loading graph data...</p>
            </div>
        )
    }

    if (state === "mock" && error) {
        return (
            <>
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <div className="bg-[#181818] border border-white/10 rounded-lg px-4 py-2">
                        <p className="text-white/50 text-xs font-mono">{error}</p>
                    </div>
                </div>
                <GraphEvents
                    onSelectNode={onSelectNode}
                    externalSelectedKey={selectedNode?.key ?? null}
                    onHoverNode={onHoverNode}
                    onHoverEdge={onHoverEdge}
                    hiddenClusters={hiddenClusters}
                    focusedCluster={focusedCluster}
                    pathNodes={pathNodes}
                    pathEdges={pathEdges}
                    filter={filter}
                    onStatsChange={onStatsChange}
                />
            </>
        )
    }

    return (
        <GraphEvents
            onSelectNode={onSelectNode}
            onHoverNode={onHoverNode}
            onHoverEdge={onHoverEdge}
            hiddenClusters={hiddenClusters}
            focusedCluster={focusedCluster}
            pathNodes={pathNodes}
            pathEdges={pathEdges}
            filter={filter}
            onStatsChange={onStatsChange}
        />
    )
}

/** Navigate sigma camera to a node. Needs access to useSigma. */
function GraphNavigator({
    targetNode,
    onNavigated,
    onSelectNode,
}: {
    targetNode: string | null
    onNavigated: () => void
    onSelectNode: (node: SelectedNode | null) => void
}) {
    const sigma = useSigma()

    useEffect(() => {
        if (!targetNode) return

        const graph = sigma.getGraph()
        if (!graph.hasNode(targetNode)) return

        // Center camera on the node
        const x = graph.getNodeAttribute(targetNode, "x")
        const y = graph.getNodeAttribute(targetNode, "y")
        sigma.getCamera().animate({ x, y, ratio: 0.3 }, { duration: 300 })

        // Build selected node info
        const attrs = graph.getNodeAttributes(targetNode)
        const neighbors: SelectedNode["neighbors"] = []

        graph.forEachOutEdge(targetNode, (_edge, edgeAttrs, _source, target) => {
            if (graph.hasNode(target)) {
                neighbors.push({
                    key: target,
                    attrs: graph.getNodeAttributes(target) as any,
                    weight: edgeAttrs.weight,
                    direction: "outgoing",
                })
            }
        })
        graph.forEachInEdge(targetNode, (_edge, edgeAttrs, source) => {
            if (graph.hasNode(source)) {
                neighbors.push({
                    key: source,
                    attrs: graph.getNodeAttributes(source) as any,
                    weight: edgeAttrs.weight,
                    direction: "incoming",
                })
            }
        })
        neighbors.sort((a, b) => b.weight - a.weight)

        onSelectNode({ key: targetNode, attrs: attrs as any, neighbors })
        onNavigated()
    }, [targetNode, sigma, onSelectNode, onNavigated])

    return null
}

const DEFAULT_PATH_STATE: PathModeState = {
    from: null,
    to: null,
    result: null,
    loading: false,
    error: null,
    algorithm: "shortest",
}

export default function GraphView() {
    const { graph } = useGraphData()
    const clusters = useClusterInfo(graph)
    const [hiddenClusters, setHiddenClusters] = useState<Set<number>>(new Set())
    const [focusedCluster, setFocusedCluster] = useState<number | null>(null)
    const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
    const [hoveredNode, setHoveredNode] = useState<{
        key: string
        label: string
        artists: string[]
        totalPlays: number
        pageRank: number
        x: number
        y: number
    } | null>(null)
    const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const [navigateTarget, setNavigateTarget] = useState<string | null>(null)
    const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
    const [filterStats, setFilterStats] = useState({
        visibleNodes: 0,
        maxPlays: 200,
        maxEdgeWeight: 50,
    })
    const [showFilters, setShowFilters] = useState(false)
    const [pathMode, setPathMode] = useState(false)
    const [pathState, setPathState] = useState<PathModeState>(DEFAULT_PATH_STATE)
    const totalNodes = graph?.order ?? 0

    // Compute path node/edge sets for highlighting
    const pathNodes = useMemo(() => {
        if (!pathState.result?.found) return undefined
        return new Set(pathState.result.path.map((s) => s.songKey))
    }, [pathState.result])

    const pathEdges = useMemo(() => {
        if (!pathState.result?.found) return undefined
        const edges = new Set<string>()
        const steps = pathState.result.path
        for (let i = 0; i < steps.length - 1; i++) {
            edges.add(`${steps[i]!.songKey}→${steps[i + 1]!.songKey}`)
        }
        return edges
    }, [pathState.result])

    const handleToggleCluster = useCallback((clusterId: number) => {
        setHiddenClusters((prev) => {
            const next = new Set(prev)
            if (next.has(clusterId)) {
                next.delete(clusterId)
            } else {
                next.add(clusterId)
            }
            return next
        })
        setFocusedCluster((prev) => (prev === clusterId ? null : prev))
    }, [])

    const hasActiveFilters =
        filter.minPlays > 0 ||
        filter.minPageRankPct > 0 ||
        filter.minEdgeWeight > 0 ||
        filter.activeSources.size > 0

    return (
        <div className="relative w-full h-full">
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3 pointer-events-none">
                <div className="pointer-events-auto">
                    <a
                        href="/"
                        className="text-white/50 hover:text-white/80 text-xs font-mono transition-colors"
                    >
                        &larr; back
                    </a>
                </div>
                <h1 className="text-white/70 text-sm font-mono tracking-wider">LISTENING GRAPH</h1>
                <div className="w-16" />
            </div>
            <ClusterLegend
                clusters={clusters}
                hiddenClusters={hiddenClusters}
                focusedCluster={focusedCluster}
                onToggleCluster={handleToggleCluster}
                onFocusCluster={setFocusedCluster}
            />
            <SigmaContainer
                style={{
                    width: "100%",
                    height: "100%",
                    background: "#0B0B0B",
                }}
                settings={{
                    allowInvalidContainer: true,
                    renderLabels: true,
                    labelRenderedSizeThreshold: 8,
                    defaultNodeType: "circle",
                    defaultEdgeType: "line",
                    labelFont: "DM Mono, monospace",
                    labelColor: { color: "rgba(255,255,255,0.8)" },
                    stagePadding: 40,
                }}
            >
                <GraphInner
                    onSelectNode={setSelectedNode}
                    selectedNode={selectedNode}
                    onHoverNode={setHoveredNode}
                    onHoverEdge={setHoveredEdge}
                    onMouseMove={setMousePos}
                    hiddenClusters={hiddenClusters}
                    focusedCluster={focusedCluster}
                    pathNodes={pathMode ? pathNodes : undefined}
                    pathEdges={pathMode ? pathEdges : undefined}
                    filter={filter}
                    onStatsChange={setFilterStats}
                />
                <GraphNavigator
                    targetNode={navigateTarget}
                    onNavigated={() => setNavigateTarget(null)}
                    onSelectNode={setSelectedNode}
                />
                <div className="absolute top-12 right-4 z-20 pointer-events-auto">
                    <SearchBarInner onSelect={setNavigateTarget} />
                </div>
            </SigmaContainer>

            {/* Filter + path toggle — top left, below header */}
            <div className="absolute top-12 left-4 z-20 flex items-start gap-2 pointer-events-auto">
                <button
                    onClick={() => setShowFilters((prev) => !prev)}
                    className={`p-2 rounded-lg border transition-colors ${
                        showFilters || hasActiveFilters
                            ? "bg-white/10 border-white/20 text-white/70"
                            : "bg-[#181818] border-white/10 text-white/40 hover:text-white/60"
                    }`}
                    title="Toggle filters"
                >
                    <SlidersHorizontal size={14} />
                </button>
                <button
                    onClick={() => {
                        setPathMode((prev) => !prev)
                        if (pathMode) setPathState(DEFAULT_PATH_STATE)
                    }}
                    className={`p-2 rounded-lg border transition-colors ${
                        pathMode
                            ? "bg-white/10 border-white/20 text-white/70"
                            : "bg-[#181818] border-white/10 text-white/40 hover:text-white/60"
                    }`}
                    title="Path explorer"
                >
                    <Route size={14} />
                </button>
            </div>

            {/* Filter panel */}
            {showFilters && (
                <div className="absolute top-12 left-14 z-20 pointer-events-auto">
                    <FilterPanel
                        filter={filter}
                        onFilterChange={setFilter}
                        totalNodes={totalNodes}
                        visibleNodes={filterStats.visibleNodes}
                        maxPlays={filterStats.maxPlays}
                        maxEdgeWeight={filterStats.maxEdgeWeight}
                    />
                </div>
            )}

            {/* Overlays rendered outside SigmaContainer for proper positioning */}
            {hoveredNode && !selectedNode && (
                <div
                    className="absolute z-30 pointer-events-none"
                    style={{ left: hoveredNode.x + 12, top: hoveredNode.y - 10 }}
                >
                    <div className="bg-[#1a1a1a] border border-white/15 rounded-lg px-3 py-2 shadow-lg max-w-64">
                        <p className="text-white/90 text-xs font-mono font-medium truncate">
                            {hoveredNode.label.split(" — ")[1] ?? hoveredNode.label}
                        </p>
                        <p className="text-white/50 text-[10px] font-mono truncate">
                            {hoveredNode.artists.join(", ")}
                        </p>
                        <div className="flex gap-3 mt-1.5">
                            <span className="text-white/40 text-[10px] font-mono">
                                {hoveredNode.totalPlays.toLocaleString()} plays
                            </span>
                            <span className="text-white/40 text-[10px] font-mono">
                                PR: {hoveredNode.pageRank.toFixed(4)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
            {hoveredEdge && !selectedNode && (
                <div
                    className="absolute z-30 pointer-events-none"
                    style={{ left: mousePos.x + 12, top: mousePos.y - 10 }}
                >
                    <div className="bg-[#1a1a1a] border border-white/15 rounded-lg px-3 py-2 shadow-lg max-w-72">
                        <p className="text-white/70 text-[10px] font-mono truncate">
                            {hoveredEdge.sourceLabel.split(" — ")[1] ?? hoveredEdge.sourceLabel}
                        </p>
                        <p className="text-white/40 text-[10px] font-mono">
                            → {hoveredEdge.weight}x →
                        </p>
                        <p className="text-white/70 text-[10px] font-mono truncate">
                            {hoveredEdge.targetLabel.split(" — ")[1] ?? hoveredEdge.targetLabel}
                        </p>
                    </div>
                </div>
            )}
            {selectedNode && !pathMode && (
                <NodeDetailPanel
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    onNavigate={setNavigateTarget}
                />
            )}
            {pathMode && (
                <PathPanel
                    state={pathState}
                    onStateChange={setPathState}
                    onClose={() => {
                        setPathMode(false)
                        setPathState(DEFAULT_PATH_STATE)
                    }}
                    onNavigate={setNavigateTarget}
                />
            )}
        </div>
    )
}
