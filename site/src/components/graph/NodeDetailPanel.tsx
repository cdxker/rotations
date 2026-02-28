import { X } from "lucide-react"
import type { SelectedNode } from "./GraphEvents"
import { getClusterColor } from "@/lib/graph-api"

interface NodeDetailPanelProps {
    node: SelectedNode
    onClose: () => void
    onNavigate: (nodeKey: string) => void
}

export function NodeDetailPanel({ node, onClose, onNavigate }: NodeDetailPanelProps) {
    const { attrs, neighbors } = node

    const outgoing = neighbors.filter((n) => n.direction === "outgoing")
    const incoming = neighbors.filter((n) => n.direction === "incoming")

    return (
        <div className="absolute top-0 right-0 bottom-0 z-20 w-80 bg-[#121212] border-l border-white/10 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-[#121212] border-b border-white/10 px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-white text-sm font-mono font-medium truncate">
                        {attrs.label.split(" — ")[1] ?? attrs.label}
                    </h2>
                    <p className="text-white/50 text-xs font-mono truncate">
                        {attrs.artists.join(", ")}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="text-white/40 hover:text-white/80 transition-colors shrink-0 mt-0.5"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Stats */}
            <div className="px-4 py-3 border-b border-white/10">
                <div className="grid grid-cols-2 gap-3">
                    <Stat label="Plays" value={attrs.totalPlays.toLocaleString()} />
                    <Stat label="PageRank" value={attrs.pageRank.toFixed(6)} />
                    <Stat
                        label="Cluster"
                        value={
                            <span className="flex items-center gap-1.5">
                                <span
                                    className="inline-block w-2 h-2 rounded-full"
                                    style={{ backgroundColor: getClusterColor(attrs.clusterId) }}
                                />
                                {attrs.clusterId}
                            </span>
                        }
                    />
                    <Stat label="Sources" value={attrs.sources.join(", ")} />
                </div>
                {attrs.albumName && (
                    <div className="mt-2">
                        <Stat label="Album" value={attrs.albumName} />
                    </div>
                )}
            </div>

            {/* Outgoing connections */}
            {outgoing.length > 0 && (
                <NeighborSection
                    title="Played after"
                    neighbors={outgoing}
                    onNavigate={onNavigate}
                />
            )}

            {/* Incoming connections */}
            {incoming.length > 0 && (
                <NeighborSection
                    title="Played before"
                    neighbors={incoming}
                    onNavigate={onNavigate}
                />
            )}

            {neighbors.length === 0 && (
                <div className="px-4 py-6 text-white/30 text-xs font-mono text-center">
                    No connections
                </div>
            )}
        </div>
    )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <span className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                {label}
            </span>
            <div className="text-white/80 text-xs font-mono mt-0.5 truncate">{value}</div>
        </div>
    )
}

function NeighborSection({
    title,
    neighbors,
    onNavigate,
}: {
    title: string
    neighbors: SelectedNode["neighbors"]
    onNavigate: (key: string) => void
}) {
    return (
        <div className="border-b border-white/10">
            <div className="px-4 pt-3 pb-1">
                <span className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                    {title} ({neighbors.length})
                </span>
            </div>
            <div className="px-2 pb-2">
                {neighbors.slice(0, 10).map((n) => (
                    <button
                        key={`${n.key}-${n.direction}`}
                        onClick={() => onNavigate(n.key)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 transition-colors text-left"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="text-white/70 text-xs font-mono truncate">
                                {n.attrs.label.split(" — ")[1] ?? n.attrs.label}
                            </p>
                            <p className="text-white/40 text-[10px] font-mono truncate">
                                {n.attrs.artists.join(", ")}
                            </p>
                        </div>
                        <span className="text-white/30 text-[10px] font-mono shrink-0 ml-2">
                            {n.weight}x
                        </span>
                    </button>
                ))}
                {neighbors.length > 10 && (
                    <p className="text-white/30 text-[10px] font-mono text-center py-1">
                        +{neighbors.length - 10} more
                    </p>
                )}
            </div>
        </div>
    )
}
