import type { HoveredEdge } from "./GraphEvents";

interface NodeTooltipProps {
    label: string;
    artists: string[];
    totalPlays: number;
    pageRank: number;
    x: number;
    y: number;
}

export function NodeTooltip({ label, artists, totalPlays, pageRank, x, y }: NodeTooltipProps) {
    // Extract track name from "Artist — Track" label
    const trackName = label.split(" — ")[1] ?? label;

    return (
        <div
            className="absolute z-30 pointer-events-none"
            style={{ left: x + 12, top: y - 10 }}
        >
            <div className="bg-[#1a1a1a] border border-white/15 rounded-lg px-3 py-2 shadow-lg max-w-64">
                <p className="text-white/90 text-xs font-mono font-medium truncate">
                    {trackName}
                </p>
                <p className="text-white/50 text-[10px] font-mono truncate">
                    {artists.join(", ")}
                </p>
                <div className="flex gap-3 mt-1.5">
                    <span className="text-white/40 text-[10px] font-mono">
                        {totalPlays.toLocaleString()} plays
                    </span>
                    <span className="text-white/40 text-[10px] font-mono">
                        PR: {pageRank.toFixed(4)}
                    </span>
                </div>
            </div>
        </div>
    );
}

interface EdgeTooltipProps {
    edge: HoveredEdge;
    x: number;
    y: number;
}

export function EdgeTooltip({ edge, x, y }: EdgeTooltipProps) {
    const sourceName = edge.sourceLabel.split(" — ")[1] ?? edge.sourceLabel;
    const targetName = edge.targetLabel.split(" — ")[1] ?? edge.targetLabel;

    return (
        <div
            className="absolute z-30 pointer-events-none"
            style={{ left: x + 12, top: y - 10 }}
        >
            <div className="bg-[#1a1a1a] border border-white/15 rounded-lg px-3 py-2 shadow-lg max-w-72">
                <p className="text-white/70 text-[10px] font-mono truncate">
                    {sourceName}
                </p>
                <p className="text-white/40 text-[10px] font-mono">
                    → {edge.weight}x →
                </p>
                <p className="text-white/70 text-[10px] font-mono truncate">
                    {targetName}
                </p>
            </div>
        </div>
    );
}
