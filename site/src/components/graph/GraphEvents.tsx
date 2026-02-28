import { useCallback, useEffect, useState } from "react";
import { useSigma, useRegisterEvents } from "@react-sigma/core";
import type { NodeAttributes, EdgeAttributes } from "@/lib/graph-api";
import { getClusterColor } from "@/lib/graph-api";

export interface SelectedNode {
    key: string;
    attrs: NodeAttributes;
    neighbors: Array<{
        key: string;
        attrs: NodeAttributes;
        weight: number;
        direction: "incoming" | "outgoing";
    }>;
}

export interface HoveredEdge {
    source: string;
    target: string;
    sourceLabel: string;
    targetLabel: string;
    weight: number;
}

interface GraphEventsProps {
    onSelectNode: (node: SelectedNode | null) => void;
    onHoverNode: (info: { key: string; label: string; artists: string[]; totalPlays: number; pageRank: number; x: number; y: number } | null) => void;
    onHoverEdge: (info: HoveredEdge | null) => void;
    hiddenClusters: Set<number>;
    focusedCluster: number | null;
}

/**
 * Handles Sigma events and applies reducers for node highlighting.
 * Must be rendered inside a SigmaContainer.
 */
export function GraphEvents({ onSelectNode, onHoverNode, onHoverEdge, hiddenClusters, focusedCluster }: GraphEventsProps) {
    const sigma = useSigma();
    const registerEvents = useRegisterEvents();
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    // Get neighbor set for highlighting
    const getNeighborSet = useCallback((nodeKey: string): Set<string> => {
        const graph = sigma.getGraph();
        const neighbors = new Set<string>();
        graph.forEachNeighbor(nodeKey, (neighbor) => {
            neighbors.add(neighbor);
        });
        return neighbors;
    }, [sigma]);

    // Get edge set connected to a node
    const getEdgeSet = useCallback((nodeKey: string): Set<string> => {
        const graph = sigma.getGraph();
        const edges = new Set<string>();
        graph.forEachEdge(nodeKey, (edge) => {
            edges.add(edge);
        });
        return edges;
    }, [sigma]);

    // Build selected node detail with neighbors
    const buildSelectedNode = useCallback((nodeKey: string): SelectedNode => {
        const graph = sigma.getGraph();
        const attrs = graph.getNodeAttributes(nodeKey) as NodeAttributes;

        const neighbors: SelectedNode["neighbors"] = [];

        // Outgoing edges
        graph.forEachOutEdge(nodeKey, (_edge, edgeAttrs, _source, target) => {
            if (graph.hasNode(target)) {
                const targetAttrs = graph.getNodeAttributes(target) as NodeAttributes;
                neighbors.push({
                    key: target,
                    attrs: targetAttrs,
                    weight: (edgeAttrs as EdgeAttributes).weight,
                    direction: "outgoing",
                });
            }
        });

        // Incoming edges
        graph.forEachInEdge(nodeKey, (_edge, edgeAttrs, source) => {
            if (graph.hasNode(source)) {
                const sourceAttrs = graph.getNodeAttributes(source) as NodeAttributes;
                neighbors.push({
                    key: source,
                    attrs: sourceAttrs,
                    weight: (edgeAttrs as EdgeAttributes).weight,
                    direction: "incoming",
                });
            }
        });

        // Sort by weight descending
        neighbors.sort((a, b) => b.weight - a.weight);

        return { key: nodeKey, attrs, neighbors };
    }, [sigma]);

    // Register Sigma events
    useEffect(() => {
        registerEvents({
            clickNode: ({ node }) => {
                setSelectedNode(node);
                onSelectNode(buildSelectedNode(node));
            },
            clickStage: () => {
                setSelectedNode(null);
                onSelectNode(null);
            },
            enterNode: ({ node }) => {
                setHoveredNode(node);
                const graph = sigma.getGraph();
                const attrs = graph.getNodeAttributes(node) as NodeAttributes;
                const viewportPos = sigma.graphToViewport({ x: graph.getNodeAttribute(node, "x"), y: graph.getNodeAttribute(node, "y") });
                onHoverNode({
                    key: node,
                    label: attrs.label,
                    artists: attrs.artists,
                    totalPlays: attrs.totalPlays,
                    pageRank: attrs.pageRank,
                    x: viewportPos.x,
                    y: viewportPos.y,
                });
            },
            leaveNode: () => {
                setHoveredNode(null);
                onHoverNode(null);
            },
            enterEdge: ({ edge }) => {
                const graph = sigma.getGraph();
                const edgeAttrs = graph.getEdgeAttributes(edge) as EdgeAttributes;
                const source = graph.source(edge);
                const target = graph.target(edge);
                const sourceAttrs = graph.getNodeAttributes(source) as NodeAttributes;
                const targetAttrs = graph.getNodeAttributes(target) as NodeAttributes;
                onHoverEdge({
                    source,
                    target,
                    sourceLabel: sourceAttrs.label,
                    targetLabel: targetAttrs.label,
                    weight: edgeAttrs.weight,
                });
            },
            leaveEdge: () => {
                onHoverEdge(null);
            },
        });
    }, [registerEvents, sigma, buildSelectedNode, onSelectNode, onHoverNode, onHoverEdge]);

    // Escape key to deselect
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && selectedNode) {
                setSelectedNode(null);
                onSelectNode(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedNode, onSelectNode]);

    // Apply node reducer for highlighting
    useEffect(() => {
        const activeNode = selectedNode ?? hoveredNode;

        if (!activeNode) {
            sigma.setSetting("nodeReducer", null);
            sigma.setSetting("edgeReducer", null);
            return;
        }

        const neighbors = getNeighborSet(activeNode);
        const connectedEdges = getEdgeSet(activeNode);

        sigma.setSetting("nodeReducer", (node, data) => {
            if (node === activeNode) {
                return { ...data, highlighted: true, zIndex: 1 };
            }
            if (neighbors.has(node)) {
                return { ...data, zIndex: 0 };
            }
            // Dim non-neighbors
            return { ...data, color: "#333", label: "", zIndex: -1 };
        });

        sigma.setSetting("edgeReducer", (edge, data) => {
            if (connectedEdges.has(edge)) {
                return { ...data, color: "rgba(255, 255, 255, 0.4)", zIndex: 1 };
            }
            return { ...data, hidden: true };
        });
    }, [selectedNode, hoveredNode, sigma, getNeighborSet, getEdgeSet]);

    return null;
}
