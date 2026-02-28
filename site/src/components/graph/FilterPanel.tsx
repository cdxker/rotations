import * as Slider from "@radix-ui/react-slider"
import type { ListeningSource } from "@/lib/graph-api"

export interface FilterState {
    /** Minimum play count to show a node. */
    minPlays: number
    /** Minimum PageRank percentile (0-100). 0 = show all, 50 = top 50%. */
    minPageRankPct: number
    /** Minimum edge weight to show an edge. */
    minEdgeWeight: number
    /** Which sources to include (empty = all). */
    activeSources: Set<ListeningSource>
}

export const DEFAULT_FILTER: FilterState = {
    minPlays: 0,
    minPageRankPct: 0,
    minEdgeWeight: 0,
    activeSources: new Set(),
}

interface FilterPanelProps {
    filter: FilterState
    onFilterChange: (filter: FilterState) => void
    totalNodes: number
    visibleNodes: number
    maxPlays: number
    maxEdgeWeight: number
}

const ALL_SOURCES: ListeningSource[] = ["lastfm", "spotify-recent", "spotify-playlist"]
const SOURCE_LABELS: Record<ListeningSource, string> = {
    lastfm: "Last.fm",
    "spotify-recent": "Spotify Recent",
    "spotify-playlist": "Spotify Playlist",
}

export function FilterPanel({
    filter,
    onFilterChange,
    totalNodes,
    visibleNodes,
    maxPlays,
    maxEdgeWeight,
}: FilterPanelProps) {
    const hasActiveFilters =
        filter.minPlays > 0 ||
        filter.minPageRankPct > 0 ||
        filter.minEdgeWeight > 0 ||
        filter.activeSources.size > 0

    const toggleSource = (source: ListeningSource) => {
        const next = new Set(filter.activeSources)
        if (next.has(source)) {
            next.delete(source)
        } else {
            next.add(source)
        }
        onFilterChange({ ...filter, activeSources: next })
    }

    return (
        <div className="flex flex-col gap-3 bg-[#121212]/90 backdrop-blur-sm border border-white/10 rounded-lg p-3 w-64">
            {/* Summary */}
            <div className="flex items-center justify-between">
                <span className="text-white/50 text-[10px] font-mono uppercase tracking-wider">
                    Filters
                </span>
                {hasActiveFilters && (
                    <button
                        onClick={() => onFilterChange(DEFAULT_FILTER)}
                        className="text-white/30 hover:text-white/60 text-[10px] font-mono transition-colors"
                    >
                        Reset
                    </button>
                )}
            </div>

            <div className="text-white/60 text-[10px] font-mono">
                Showing {visibleNodes.toLocaleString()} of {totalNodes.toLocaleString()} songs
            </div>

            {/* Source filter */}
            <div>
                <label className="text-white/40 text-[10px] font-mono uppercase tracking-wider block mb-1.5">
                    Source
                </label>
                <div className="flex flex-wrap gap-1">
                    {ALL_SOURCES.map((source) => {
                        const isActive =
                            filter.activeSources.size === 0 || filter.activeSources.has(source)
                        return (
                            <button
                                key={source}
                                onClick={() => toggleSource(source)}
                                className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                                    isActive
                                        ? "border-white/30 text-white/70 bg-white/5"
                                        : "border-white/10 text-white/25"
                                }`}
                            >
                                {SOURCE_LABELS[source]}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Min plays slider */}
            <FilterSlider
                label="Min plays"
                value={filter.minPlays}
                max={Math.min(maxPlays, 200)}
                displayValue={filter.minPlays > 0 ? `≥ ${filter.minPlays}` : "All"}
                onValueChange={(v) => onFilterChange({ ...filter, minPlays: v[0]! })}
            />

            {/* PageRank percentile slider */}
            <FilterSlider
                label="Top PageRank"
                value={filter.minPageRankPct}
                max={99}
                displayValue={
                    filter.minPageRankPct > 0 ? `Top ${100 - filter.minPageRankPct}%` : "All"
                }
                onValueChange={(v) => onFilterChange({ ...filter, minPageRankPct: v[0]! })}
            />

            {/* Edge weight slider */}
            <FilterSlider
                label="Min edge weight"
                value={filter.minEdgeWeight}
                max={Math.min(maxEdgeWeight, 50)}
                displayValue={filter.minEdgeWeight > 0 ? `≥ ${filter.minEdgeWeight}` : "All"}
                onValueChange={(v) => onFilterChange({ ...filter, minEdgeWeight: v[0]! })}
            />
        </div>
    )
}

function FilterSlider({
    label,
    value,
    max,
    displayValue,
    onValueChange,
}: {
    label: string
    value: number
    max: number
    displayValue: string
    onValueChange: (value: number[]) => void
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                    {label}
                </label>
                <span className="text-white/50 text-[10px] font-mono">{displayValue}</span>
            </div>
            <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-4"
                value={[value]}
                max={max}
                step={1}
                onValueChange={onValueChange}
            >
                <Slider.Track className="bg-white/10 relative grow rounded-full h-[3px]">
                    <Slider.Range className="absolute bg-white/30 rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb className="block w-3 h-3 bg-white/70 rounded-full hover:bg-white focus:outline-none focus:ring-1 focus:ring-white/50 transition-colors" />
            </Slider.Root>
        </div>
    )
}
