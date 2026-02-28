import { useCallback, useEffect, useState } from "react"
import { SigmaContainer, useLoadGraph, useSigma } from "@react-sigma/core"
import "@react-sigma/core/lib/style.css"
import { useGraphData } from "./graph/useGraphData"
import { GraphEvents } from "./graph/GraphEvents"
import type { SelectedNode, HoveredEdge } from "./graph/GraphEvents"
import { NodeDetailPanel } from "./graph/NodeDetailPanel"
import { SearchBarInner } from "./graph/SearchBar"
import { DEFAULT_FILTER } from "./graph/FilterPanel"
import type { FilterState } from "./graph/FilterPanel"

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
    depthMode,
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
            imageUrl?: string
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
    depthMode: boolean
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

    // Load graph into Sigma when data is ready, auto-focus a random node.
    // Bootstrap reducers are set in the same tick as loadGraph so the graph
    // never renders in the unhighlighted "all nodes visible" state.
    useEffect(() => {
        if (!graph) return
        loadGraph(graph)

        const nodes = graph.nodes()
        if (nodes.length === 0) return

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

        // Set bootstrap reducers immediately so the first frame is already highlighted.
        // GraphEvents will overwrite these once it processes the selection via props.
        const neighborSet = new Set<string>()
        graph.forEachNeighbor(randomKey, (n) => neighborSet.add(n))
        const edgeSet = new Set<string>()
        graph.forEachEdge(randomKey, (e) => edgeSet.add(e))

        sigma.setSetting("nodeReducer", (node, data) => {
            if (node === randomKey) return { ...data, color: "#ffffff", highlighted: true, zIndex: 1 }
            if (neighborSet.has(node)) return { ...data, color: "#999", zIndex: 0 }
            return { ...data, color: "#333", label: "", zIndex: -1 }
        })
        sigma.setSetting("edgeReducer", (edge, data) => {
            if (edgeSet.has(edge)) return { ...data, color: "rgba(255, 255, 255, 0.4)", zIndex: 1 }
            return { ...data, hidden: true }
        })
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
                    depthMode={depthMode}
                    filter={filter}
                    onStatsChange={onStatsChange}
                />
            </>
        )
    }

    return (
        <GraphEvents
            onSelectNode={onSelectNode}
            externalSelectedKey={selectedNode?.key ?? null}
            onHoverNode={onHoverNode}
            onHoverEdge={onHoverEdge}
            hiddenClusters={hiddenClusters}
            focusedCluster={focusedCluster}
            pathNodes={pathNodes}
            pathEdges={pathEdges}
            depthMode={depthMode}
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

export default function GraphView() {
    const [hiddenClusters] = useState<Set<number>>(() => new Set())
    const focusedCluster = null
    const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
    const [hoveredNode, setHoveredNode] = useState<{
        key: string
        label: string
        artists: string[]
        totalPlays: number
        pageRank: number
        imageUrl?: string
        x: number
        y: number
    } | null>(null)
    const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null)
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const [navigateTarget, setNavigateTarget] = useState<string | null>(null)
    const [filter] = useState<FilterState>(DEFAULT_FILTER)
    const [, setFilterStats] = useState({
        visibleNodes: 0,
        maxPlays: 200,
        maxEdgeWeight: 50,
    })
    const [depthMode, setDepthMode] = useState(false)
    const clearNavigateTarget = useCallback(() => setNavigateTarget(null), [])

    return (
        <div className="relative w-full h-full">
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
                    depthMode={depthMode}
                    filter={filter}
                    onStatsChange={setFilterStats}
                />
                <GraphNavigator
                    targetNode={navigateTarget}
                    onNavigated={clearNavigateTarget}
                    onSelectNode={setSelectedNode}
                />
                <div className="absolute top-12 left-4 z-20 pointer-events-auto flex items-start gap-2">
                    <SearchBarInner onSelect={setNavigateTarget} />
                    <button
                        onClick={() => setDepthMode((d) => !d)}
                        className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                            depthMode
                                ? "bg-white/20 text-white border border-white/30"
                                : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                        }`}
                        title="Toggle depth exploration (3 layers)"
                    >
                        Depth
                    </button>
                </div>
            </SigmaContainer>

            {/* Overlays rendered outside SigmaContainer for proper positioning */}
            {hoveredNode && !selectedNode && (
                <div
                    className="absolute z-30 pointer-events-none"
                    style={{ left: hoveredNode.x + 12, top: hoveredNode.y - 10 }}
                >
                    <div className="bg-[#1a1a1a] border border-white/15 rounded-lg px-3 py-2 shadow-lg max-w-64 flex items-start gap-2">
                        {hoveredNode.imageUrl && (
                            <img
                                src={hoveredNode.imageUrl}
                                alt=""
                                className="w-8 h-8 rounded shrink-0 object-cover bg-white/5"
                            />
                        )}
                        <div className="min-w-0">
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
            {selectedNode && (
                <NodeDetailPanel
                    node={selectedNode}
                    onNavigate={setNavigateTarget}
                />
            )}
        </div>
    )
}
