import { Eye, EyeOff, Focus } from "lucide-react"
import type { ClusterInfo } from "./useClusterInfo"

interface ClusterLegendProps {
    clusters: ClusterInfo[]
    hiddenClusters: Set<number>
    focusedCluster: number | null
    onToggleCluster: (clusterId: number) => void
    onFocusCluster: (clusterId: number | null) => void
}

export function ClusterLegend({
    clusters,
    hiddenClusters,
    focusedCluster,
    onToggleCluster,
    onFocusCluster,
}: ClusterLegendProps) {
    if (clusters.length === 0) return null

    return (
        <div className="absolute top-12 left-4 z-20 w-56">
            <div className="bg-[#121212]/90 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                    <span className="text-white/50 text-[10px] font-mono uppercase tracking-wider">
                        Clusters
                    </span>
                    {focusedCluster !== null && (
                        <button
                            onClick={() => onFocusCluster(null)}
                            className="text-white/40 hover:text-white/80 text-[10px] font-mono transition-colors"
                        >
                            show all
                        </button>
                    )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {clusters.map((cluster) => {
                        const isHidden = hiddenClusters.has(cluster.id)
                        const isFocused = focusedCluster === cluster.id

                        return (
                            <div
                                key={cluster.id}
                                className={`px-3 py-2 border-b border-white/5 last:border-b-0 transition-colors ${
                                    isFocused ? "bg-white/5" : ""
                                } ${isHidden ? "opacity-40" : ""}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: cluster.color }}
                                    />
                                    <span className="text-white/80 text-xs font-mono truncate flex-1">
                                        {cluster.label}
                                    </span>
                                    <span className="text-white/30 text-[10px] font-mono shrink-0">
                                        {cluster.size}
                                    </span>
                                    <button
                                        onClick={() => onToggleCluster(cluster.id)}
                                        className="text-white/30 hover:text-white/70 transition-colors shrink-0"
                                        title={isHidden ? "Show cluster" : "Hide cluster"}
                                    >
                                        {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </button>
                                    <button
                                        onClick={() =>
                                            onFocusCluster(isFocused ? null : cluster.id)
                                        }
                                        className={`transition-colors shrink-0 ${
                                            isFocused
                                                ? "text-white/80"
                                                : "text-white/30 hover:text-white/70"
                                        }`}
                                        title={isFocused ? "Unfocus" : "Focus cluster"}
                                    >
                                        <Focus size={12} />
                                    </button>
                                </div>
                                {/* Top songs preview */}
                                {!isHidden && cluster.topSongs.length > 0 && (
                                    <div className="mt-1 ml-4.5">
                                        {cluster.topSongs.map((song) => (
                                            <p
                                                key={song.key}
                                                className="text-white/30 text-[10px] font-mono truncate"
                                            >
                                                {song.label.split(" — ")[1] ?? song.label}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
