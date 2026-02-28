import { useEffect, useRef } from "react";
import {
    SigmaContainer,
    useLoadGraph,
    useSigma,
} from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import "@react-sigma/core/lib/style.css";
import { useGraphData } from "./graph/useGraphData";

/** Load graph data into Sigma and run ForceAtlas2 layout. */
function GraphLoader() {
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
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                <div className="bg-[#181818] border border-white/10 rounded-lg px-4 py-2">
                    <p className="text-white/50 text-xs font-mono">{error}</p>
                </div>
            </div>
        );
    }

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
                <GraphLoader />
            </SigmaContainer>
        </div>
    );
}
