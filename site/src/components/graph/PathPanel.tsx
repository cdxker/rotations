import { useCallback, useEffect, useRef, type KeyboardEvent } from "react"
import { X, Route, ArrowRight, Search } from "lucide-react"
import { useSigma } from "@react-sigma/core"
import { fetchPath } from "@/lib/graph-api"
import type { PathResult } from "@/lib/graph-api"
import { useNodeSearch } from "./useNodeSearch"

/** Inline node search for picking start/end nodes. */
function NodePicker({
    label,
    value,
    onSelect,
    onClear,
}: {
    label: string
    value: { key: string; label: string } | null
    onSelect: (key: string, label: string) => void
    onClear: () => void
}) {
    const sigma = useSigma()
    const {
        query,
        setQuery,
        results,
        isOpen,
        setIsOpen,
        selectedIndex,
        handleKeyDown: hookKeyDown,
        clear,
        inputRef,
        containerRef,
    } = useNodeSearch(sigma, { maxResults: 8 })

    const handleSelect = useCallback(
        (key: string, nodeLabel: string) => {
            onSelect(key, nodeLabel)
            clear()
        },
        [onSelect, clear]
    )

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const selected = hookKeyDown(e)
            if (selected) {
                handleSelect(selected.key, selected.label)
            }
        },
        [hookKeyDown, handleSelect]
    )

    if (value) {
        return (
            <div>
                <span className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                    {label}
                </span>
                <div className="flex items-center justify-between mt-1 bg-white/5 rounded px-2 py-1.5">
                    <span className="text-white/80 text-xs font-mono truncate">{value.label}</span>
                    <button
                        onClick={onClear}
                        className="text-white/30 hover:text-white/60 transition-colors shrink-0 ml-1"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div ref={containerRef} className="relative">
            <span className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                {label}
            </span>
            <div className="flex items-center gap-2 mt-1 bg-white/5 rounded px-2 py-1.5">
                <Search size={12} className="text-white/30 shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true)
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Search..."
                    className="bg-transparent text-white/80 text-xs font-mono placeholder:text-white/30 outline-none w-full"
                />
            </div>
            {isOpen && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded overflow-hidden shadow-lg max-h-48 overflow-y-auto z-50">
                    {results.map((r, i) => (
                        <button
                            key={r.key}
                            onClick={() => handleSelect(r.key, r.label)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 text-left transition-colors ${
                                i === selectedIndex ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                        >
                            <span className="text-white/80 text-xs font-mono truncate">
                                {r.label}
                            </span>
                            <span className="text-white/30 text-[10px] font-mono shrink-0 ml-2">
                                {r.totalPlays}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export interface PathModeState {
    from: { key: string; label: string } | null
    to: { key: string; label: string } | null
    result: PathResult | null
    loading: boolean
    error: string | null
    algorithm: "shortest" | "strongest"
}

interface PathPanelProps {
    state: PathModeState
    onStateChange: (state: PathModeState) => void
    onClose: () => void
    onNavigate: (nodeKey: string) => void
}

export function PathPanel({ state, onStateChange, onClose, onNavigate }: PathPanelProps) {
    const stateRef = useRef(state)
    // eslint-disable-next-line react-hooks/refs
    stateRef.current = state

    const update = useCallback(
        (partial: Partial<PathModeState>) => onStateChange({ ...stateRef.current, ...partial }),
        [onStateChange]
    )

    // Auto-search when both nodes are selected
    useEffect(() => {
        if (!state.from || !state.to) return

        let cancelled = false
        update({ loading: true, error: null, result: null })

        fetchPath(state.from.key, state.to.key, state.algorithm)
            .then((result) => {
                if (!cancelled) {
                    onStateChange({
                        ...stateRef.current,
                        loading: false,
                        result,
                        error: result.found ? null : "No path exists between these songs",
                    })
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    onStateChange({
                        ...stateRef.current,
                        loading: false,
                        error: err instanceof Error ? err.message : "Failed to find path",
                    })
                }
            })

        return () => {
            cancelled = true
            onStateChange({ ...stateRef.current, loading: false })
        }
    }, [state.from?.key, state.to?.key, state.algorithm])

    return (
        <div className="absolute top-0 right-0 bottom-0 z-20 w-80 bg-[#121212] border-l border-white/10 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-[#121212] border-b border-white/10 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Route size={14} className="text-white/50" />
                    <h2 className="text-white text-sm font-mono font-medium">Path Explorer</h2>
                </div>
                <button
                    onClick={onClose}
                    className="text-white/40 hover:text-white/80 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Node pickers */}
            <div className="px-4 py-3 border-b border-white/10 space-y-3">
                <NodePicker
                    label="From"
                    value={state.from}
                    onSelect={(key, label) =>
                        update({ from: { key, label }, result: null, error: null })
                    }
                    onClear={() => update({ from: null, result: null, error: null })}
                />
                <NodePicker
                    label="To"
                    value={state.to}
                    onSelect={(key, label) =>
                        update({ to: { key, label }, result: null, error: null })
                    }
                    onClear={() => update({ to: null, result: null, error: null })}
                />
            </div>

            {/* Algorithm toggle */}
            <div className="px-4 py-3 border-b border-white/10">
                <span className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                    Algorithm
                </span>
                <div className="flex gap-1 mt-1">
                    <button
                        onClick={() => update({ algorithm: "shortest", result: null, error: null })}
                        className={`flex-1 text-xs font-mono py-1.5 rounded transition-colors ${
                            state.algorithm === "shortest"
                                ? "bg-white/10 text-white/80"
                                : "text-white/40 hover:text-white/60"
                        }`}
                    >
                        Shortest
                    </button>
                    <button
                        onClick={() =>
                            update({ algorithm: "strongest", result: null, error: null })
                        }
                        className={`flex-1 text-xs font-mono py-1.5 rounded transition-colors ${
                            state.algorithm === "strongest"
                                ? "bg-white/10 text-white/80"
                                : "text-white/40 hover:text-white/60"
                        }`}
                    >
                        Strongest
                    </button>
                </div>
            </div>

            {/* Loading */}
            {state.loading && (
                <div className="px-4 py-6 text-center">
                    <p className="text-white/50 text-xs font-mono">Finding path...</p>
                </div>
            )}

            {/* Error / no path */}
            {state.error && !state.loading && (
                <div className="px-4 py-6 text-center">
                    <p className="text-white/40 text-xs font-mono">{state.error}</p>
                </div>
            )}

            {/* Path result */}
            {state.result?.found && !state.loading && (
                <>
                    {/* Path stats */}
                    <div className="px-4 py-3 border-b border-white/10">
                        <div className="grid grid-cols-3 gap-3">
                            <PathStat label="Hops" value={state.result.hops.toString()} />
                            <PathStat
                                label="Total Wt"
                                value={state.result.totalWeight.toString()}
                            />
                            <PathStat
                                label="Min Edge"
                                value={state.result.minEdgeWeight.toString()}
                            />
                        </div>
                    </div>

                    {/* Path steps */}
                    <div className="px-2 py-2">
                        {state.result.path.map((step, i) => (
                            <div key={step.songKey}>
                                <button
                                    onClick={() => onNavigate(step.songKey)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 transition-colors text-left"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-white/70 text-xs font-mono truncate">
                                            {step.name}
                                        </p>
                                        <p className="text-white/40 text-[10px] font-mono truncate">
                                            {step.artists.join(", ")}
                                        </p>
                                    </div>
                                </button>
                                {step.edgeWeight !== undefined &&
                                    i < state.result!.path.length - 1 && (
                                        <div className="flex items-center gap-1 px-3 py-0.5">
                                            <ArrowRight size={10} className="text-white/20" />
                                            <span className="text-white/30 text-[10px] font-mono">
                                                {step.edgeWeight}x
                                            </span>
                                        </div>
                                    )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Prompt when no nodes selected */}
            {!state.from && !state.to && (
                <div className="px-4 py-6 text-center">
                    <p className="text-white/30 text-xs font-mono">
                        Select two songs to find a path between them
                    </p>
                </div>
            )}
        </div>
    )
}

function PathStat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span className="text-white/40 text-[10px] font-mono uppercase tracking-wider">
                {label}
            </span>
            <div className="text-white/80 text-xs font-mono mt-0.5">{value}</div>
        </div>
    )
}
