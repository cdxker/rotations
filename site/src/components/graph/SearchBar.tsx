import { useCallback } from "react"
import { Search, X } from "lucide-react"
import { useSigma } from "@react-sigma/core"
import { useNodeSearch } from "./useNodeSearch"

interface SearchBarProps {
    onSelect: (nodeKey: string) => void
}

/**
 * Search bar with autocomplete for finding songs in the graph.
 * Must be rendered inside a SigmaContainer.
 */
export function SearchBarInner({ onSelect }: SearchBarProps) {
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
    } = useNodeSearch(sigma, { maxResults: 10 })

    const handleSelect = useCallback(
        (nodeKey: string) => {
            onSelect(nodeKey)
            clear()
            inputRef.current?.blur()
        },
        [onSelect, clear, inputRef]
    )

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            const selected = hookKeyDown(e)
            if (selected) {
                handleSelect(selected.key)
            }
        },
        [hookKeyDown, handleSelect]
    )

    return (
        <div ref={containerRef} className="relative">
            <div className="flex items-center gap-2 bg-[#121212]/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg">
                <Search size={14} className="text-white/40 shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (results.length > 0) setIsOpen(true)
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Search active tracks..."
                    className="bg-transparent text-white/80 text-xs font-mono placeholder:text-white/30 outline-none w-56 max-w-[60vw]"
                />
                {query && (
                    <button
                        onClick={clear}
                        className="text-white/30 hover:text-white/60 transition-colors"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden shadow-lg max-h-64 overflow-y-auto z-50">
                    {results.map((result, i) => (
                        <button
                            key={result.key}
                            onClick={() => handleSelect(result.key)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                                i === selectedIndex ? "bg-white/10" : "hover:bg-white/5"
                            }`}
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-white/80 text-xs font-mono truncate">
                                    {result.label}
                                </p>
                            </div>
                            <span className="text-white/30 text-[10px] font-mono shrink-0 ml-2">
                                {result.totalPlays} plays
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
