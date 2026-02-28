import { useCallback, useEffect, useRef, useState } from "react";
import {
    SigmaContainer,
    useLoadGraph,
    useSigma,
} from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import "@react-sigma/core/lib/style.css";
import { useGraphData } from "./graph/useGraphData";
import { GraphEvents } from "./graph/GraphEvents";
import type { SelectedNode, HoveredEdge } from "./graph/GraphEvents";
import { NodeTooltip, EdgeTooltip } from "./graph/GraphTooltip";
import { NodeDetailPanel } from "./graph/NodeDetailPanel";

/** Load graph data into Sigma and run ForceAtlas2 layout. */
function GraphInner({
    onSelectNode,
    selectedNode,
    onHoverNode,
    onHoverEdge,
    onMouseMove,
}: {
    onSelectNode: (node: SelectedNode | null) => void;
    selectedNode: SelectedNode | null;
    onHoverNode: (info: { key: string; label: string; artists: string[]; totalPlays: number; pageRank: number; x: number; y: number } | null) => void;
    onHoverEdge: (info: HoveredEdge | null) => void;
    onMouseMove: (pos: { x: number; y: number }) => void;
}) {
    const { graph, state, error } = useGraphData();
    const loadGraph = useLoadGraph();
    const sigma = useSigma();
    const { start, stop, isRunning } = useWorkerLayoutForceAtlas2({
        settings: {
            gravity: 1,
            scalingRatio: 10,
            strongGravityMode: true,
            slowDown: 5,
            barnesHutOptimize: true,
        },
    });
    const layoutTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track mouse position for edge tooltip
    useEffect(() => {
        const container = sigma.getContainer();
        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            onMouseMove({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        };
        container.addEventListener("mousemove", handleMouseMove);
        return () => container.removeEventListener("mousemove", handleMouseMove);
    }, [sigma, onMouseMove]);

    // Load graph into Sigma when data is ready
    useEffect(() => {
        if (!graph) return;

        loadGraph(graph);

        // Run ForceAtlas2 for a few seconds to settle the layout
        start();
        layoutTimeout.current = setTimeout(() => {
            stop();
        }, 5000);

        return () => {
            if (layoutTimeout.current) clearTimeout(layoutTimeout.current);
            if (isRunning) stop();
        };
    }, [graph]);

    // Configure Sigma settings for dark theme
    useEffect(() => {
        sigma.setSetting("defaultNodeColor", "#666");
        sigma.setSetting("defaultEdgeColor", "rgba(255,255,255,0.08)");
        sigma.setSetting("labelColor", { color: "rgba(255,255,255,0.8)" });
        sigma.setSetting("labelFont", "DM Mono, monospace");
        sigma.setSetting("labelSize", 11);
        sigma.setSetting("labelRenderedSizeThreshold", 8);
        sigma.setSetting("enableEdgeEvents", true);
    }, [sigma]);

    // Status indicator
    if (state === "loading") {
        return (
            <div className="absolute inset-0 flex items-center justify-center z-10">
                <p className="text-white/60 text-sm font-mono">Loading graph data...</p>
            </div>
        );
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
                    onHoverNode={onHoverNode}
                    onHoverEdge={onHoverEdge}
                />
            </>
        );
    }

    return (
        <GraphEvents
            onSelectNode={onSelectNode}
            onHoverNode={onHoverNode}
            onHoverEdge={onHoverEdge}
        />
    );
}

/** Navigate sigma camera to a node. Needs access to useSigma. */
function GraphNavigator({
    targetNode,
    onNavigated,
    onSelectNode,
}: {
    targetNode: string | null;
    onNavigated: () => void;
    onSelectNode: (node: SelectedNode | null) => void;
}) {
    const sigma = useSigma();

    useEffect(() => {
        if (!targetNode) return;

        const graph = sigma.getGraph();
        if (!graph.hasNode(targetNode)) return;

        // Center camera on the node
        const x = graph.getNodeAttribute(targetNode, "x");
        const y = graph.getNodeAttribute(targetNode, "y");
        sigma.getCamera().animate({ x, y, ratio: 0.3 }, { duration: 300 });

        // Build selected node info
        const attrs = graph.getNodeAttributes(targetNode);
        const neighbors: SelectedNode["neighbors"] = [];

        graph.forEachOutEdge(targetNode, (_edge, edgeAttrs, _source, target) => {
            if (graph.hasNode(target)) {
                neighbors.push({
                    key: target,
                    attrs: graph.getNodeAttributes(target) as any,
                    weight: edgeAttrs.weight,
                    direction: "outgoing",
                });
            }
        });
        graph.forEachInEdge(targetNode, (_edge, edgeAttrs, source) => {
            if (graph.hasNode(source)) {
                neighbors.push({
                    key: source,
                    attrs: graph.getNodeAttributes(source) as any,
                    weight: edgeAttrs.weight,
                    direction: "incoming",
                });
            }
        });
        neighbors.sort((a, b) => b.weight - a.weight);

        onSelectNode({ key: targetNode, attrs: attrs as any, neighbors });
        onNavigated();
    }, [targetNode, sigma, onSelectNode, onNavigated]);

    return null;
}

/** Top bar with title. */
function GraphHeader() {
    return (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3 pointer-events-none">
            <div className="pointer-events-auto">
                <a
                    href="/"
                    className="text-white/50 hover:text-white/80 text-xs font-mono transition-colors"
                >
                    &larr; back
                </a>
            </div>
            <h1 className="text-white/70 text-sm font-mono tracking-wider">
                LISTENING GRAPH
            </h1>
            <div className="w-16" />
        </div>
    );
}

export default function GraphView() {
    const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
    const [hoveredNode, setHoveredNode] = useState<{
        key: string;
        label: string;
        artists: string[];
        totalPlays: number;
        pageRank: number;
        x: number;
        y: number;
    } | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [navigateTarget, setNavigateTarget] = useState<string | null>(null);

    const handleNavigate = useCallback((nodeKey: string) => {
        setNavigateTarget(nodeKey);
    }, []);

    const handleNavigated = useCallback(() => {
        setNavigateTarget(null);
    }, []);

    return (
        <div className="relative w-full h-full">
            <GraphHeader />
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
                />
                <GraphNavigator
                    targetNode={navigateTarget}
                    onNavigated={handleNavigated}
                    onSelectNode={setSelectedNode}
                />
            </SigmaContainer>

            {/* Overlays rendered outside SigmaContainer for proper positioning */}
            {hoveredNode && !selectedNode && (
                <NodeTooltip {...hoveredNode} />
            )}
            {hoveredEdge && !selectedNode && (
                <EdgeTooltip edge={hoveredEdge} x={mousePos.x} y={mousePos.y} />
            )}
            {selectedNode && (
                <NodeDetailPanel
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    onNavigate={handleNavigate}
                />
            )}
        </div>
    );
}
