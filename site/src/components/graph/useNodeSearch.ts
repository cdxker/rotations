import { useCallback, useEffect, useRef, useState } from "react"
import type Sigma from "sigma"
import type { NodeAttributes } from "@/lib/graph-api"

export interface SearchResult {
    key: string
    label: string
    totalPlays: number
}

interface UseNodeSearchOptions {
    /** Maximum results to display (default 10) */
    maxResults?: number
}

/**
 * Shared hook for searching graph nodes by label.
 * Used by SearchBar and PathPanel's NodePicker.
 */
export function useNodeSearch(sigma: Sigma, options: UseNodeSearchOptions = {}) {
    const { maxResults = 10 } = options

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

        for (const node of graph.nodes()) {
            const nodeAttrs = graph.getNodeAttributes(node) as NodeAttributes
            if (nodeAttrs.label.toLowerCase().includes(lowerQuery)) {
                matches.push({
                    key: node,
                    label: nodeAttrs.label,
                    totalPlays: nodeAttrs.totalPlays,
                })
            }
            if (matches.length >= 20) break
        }

        // Sort by play count descending for better relevance
        matches.sort((a, b) => b.totalPlays - a.totalPlays)

        setResults(matches.slice(0, maxResults))
        setSelectedIndex(0)
        setIsOpen(matches.length > 0)
    }, [query, sigma, maxResults])

    const clear = useCallback(() => {
        setQuery("")
        setResults([])
        setIsOpen(false)
    }, [])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault()
                e.stopPropagation()
                setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
            } else if (e.key === "ArrowUp") {
                e.preventDefault()
                e.stopPropagation()
                setSelectedIndex((prev) => Math.max(prev - 1, 0))
            } else if (e.key === "Enter" && results[selectedIndex]) {
                e.preventDefault()
                e.stopPropagation()
                return results[selectedIndex]
            } else if (e.key === "Escape") {
                e.stopPropagation()
                setIsOpen(false)
                inputRef.current?.blur()
            }
            return null
        },
        [results, selectedIndex]
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

    return {
        query,
        setQuery,
        results,
        isOpen,
        setIsOpen,
        selectedIndex,
        handleKeyDown,
        clear,
        inputRef,
        containerRef,
    }
}
