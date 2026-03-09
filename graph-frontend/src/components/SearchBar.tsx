import { useMemo } from "react"
import { Search } from "lucide-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useGraph } from "../contexts/graphContext"
import type { NodeAttributes } from "#/lib/types"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "#/components/ui/combobox"

type SearchItem = NodeAttributes & { key: string }

/**
 * Search bar with combobox autocomplete for finding songs in the graph.
 * Reads the graph from GraphContext so it can be rendered outside a SigmaContainer.
 */
export function SearchBar() {
  const { graph, setSelectedNode } = useGraph()
  const { q } = useSearch({ from: "/user/$username" })
  const navigate = useNavigate()

  const items = useMemo(() => {
    if (!graph) return []
    const nodes: SearchItem[] = []
    for (const node of graph.nodes()) {
      nodes.push({ key: node, ...graph.getNodeAttributes(node) })
    }
    nodes.sort((a, b) => b.totalPlays - a.totalPlays)
    return nodes
  }, [graph])

  function handleSelect(result: SearchItem | null) {
    if (result) setSelectedNode(result.key)
  }

  function handleInputChange(value: string) {
    void navigate({
      from: "/user/$username",
      search: { q: value || undefined },
      replace: true,
    })
  }

  return (
    <div className="flex items-center gap-2 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg">
      <Search size={14} className="text-white/40 shrink-0" />
      <Combobox<SearchItem>
        items={items}
        itemToStringValue={(item) => item.label}
        onValueChange={handleSelect}
        onInputValueChange={handleInputChange}
        inputValue={q ?? ""}
      >
        <ComboboxPrimitive.Input
          placeholder="Search tracks..."
          className="bg-transparent text-white/80 text-xs font-mono placeholder:text-white/30 outline-none w-56 max-w-[60vw]"
        />
        <ComboboxContent>
          <ComboboxEmpty>No tracks found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.key} value={item}>
                <span className="min-w-0 flex-1 truncate text-xs font-mono">
                  {item.label}
                </span>
                <span className="text-muted-foreground text-[10px] font-mono shrink-0 ml-2">
                  {item.totalPlays} plays
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
