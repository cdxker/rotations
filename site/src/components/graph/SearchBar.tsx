import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { useSigma } from "@react-sigma/core"
import type { NodeAttributes } from "@/lib/graph-api"

interface SearchResult {
    key: string
    label: string
    totalPlays: number
}

interface SearchBarProps {
    onSelect: (nodeKey: string) => void
}

/**
 * Search bar with autocomplete for finding songs in the graph.
 * Must be rendered inside a SigmaContainer.
 */
export function SearchBarInner({ onSelect }: SearchBarProps) {
    const sigma = useSigma()
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<SearchResult[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Search the graph when query changes
    useEffect(() => {
        if (!query.trim()) {
            setResults([])
            setIsOpen(false)
            return
        }

        const graph = sigma.getGraph()
        const lowerQuery = query.toLowerCase()
        const matches: SearchResult[] = []

        graph.forEachNode((node, attrs) => {
            const nodeAttrs = attrs as NodeAttributes
            const label = nodeAttrs.label.toLowerCase()
            if (label.includes(lowerQuery)) {
                matches.push({
                    key: node,
                    label: nodeAttrs.label,
                    totalPlays: nodeAttrs.totalPlays,
                })
            }
            if (matches.length >= 20) return
        })

        // Sort by play count descending for better relevance
        matches.sort((a, b) => b.totalPlays - a.totalPlays)

        setResults(matches.slice(0, 10))
        setSelectedIndex(0)
        setIsOpen(matches.length > 0)
    }, [query, sigma])

    const handleSelect = useCallback(
        (nodeKey: string) => {
            onSelect(nodeKey)
            setQuery("")
            setResults([])
            setIsOpen(false)
            inputRef.current?.blur()
        },
        [onSelect]
    )

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault()
                setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
            } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setSelectedIndex((prev) => Math.max(prev - 1, 0))
            } else if (e.key === "Enter" && results[selectedIndex]) {
                e.preventDefault()
                handleSelect(results[selectedIndex].key)
            } else if (e.key === "Escape") {
                setIsOpen(false)
                inputRef.current?.blur()
            }
        },
        [results, selectedIndex, handleSelect]
    )

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

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
                        onClick={() => {
                            setQuery("")
                            setResults([])
                            setIsOpen(false)
                        }}
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
