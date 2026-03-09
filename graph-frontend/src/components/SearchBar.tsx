import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { useGraph } from "../contexts/graphContext"
import type { NodeAttributes } from "#/lib/types"

/**
 * Search bar using native <datalist> for autocomplete.
 * Reads the graph from GraphContext so it can be rendered outside a SigmaContainer.
 */
export function SearchBar() {
  const { graph, setSelectedNode } = useGraph()
  const [query, setQuery] = useState("")

  function handleChange(value: string) {
    setQuery(value)
    if (!graph) return

    const nodeKey = graph.findNode((_key, attrs) => attrs.label === value)
    if (nodeKey) {
      setSelectedNode(nodeKey)
    }
  }


  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    if (!query.trim() || !graph) {
      setOptions([])
      return
    }
    const lowerQuery = query.toLowerCase()
    const matches: { key: string; attrs: NodeAttributes }[] = []

    for (const node of graph.nodes()) {
      const attrs = graph.getNodeAttributes(node)
      if (attrs.label.toLowerCase().includes(lowerQuery)) {
        matches.push({ key: node, attrs })
      }
      if (matches.length >= 20) break
    }

    matches.sort((a, b) => b.attrs.totalPlays - a.attrs.totalPlays)
    setOptions(matches.slice(0, 10).map((m) => m.attrs.label))
  }, [query, graph])

  return (
    <div className="flex items-center gap-2 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg">
      <Search size={14} className="text-white/40 shrink-0" />
      <input
        type="text"
        list="search-results"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search tracks..."
        className="bg-transparent text-white/80 text-xs font-mono placeholder:text-white/30 outline-none w-56 max-w-[60vw]"
      />
      <datalist id="search-results">
        {options.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </div>
  )
}
