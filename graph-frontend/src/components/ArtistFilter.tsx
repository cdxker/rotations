import { useMemo, useRef, useState } from "react"
import { Users } from "lucide-react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { useGraph } from "../contexts/graphContext"
import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
} from "#/components/ui/combobox"

type ArtistEntry = { name: string; count: number }

export function ArtistFilter() {
  const { graph, setArtistFilter } = useGraph()
  const [selected, setSelected] = useState<ArtistEntry[]>([])
  const anchorRef = useRef<HTMLDivElement | null>(null)

  const artists = useMemo(() => {
    if (!graph) return []
    const counts = new Map<string, number>()
    graph.forEachNode((_id, attrs) => {
      for (const artist of attrs.artists) {
        counts.set(artist, (counts.get(artist) ?? 0) + 1)
      }
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [graph])

  function handleValueChange(value: ArtistEntry[]) {
    setSelected(value)
    if (value.length === 0) {
      setArtistFilter(null)
    } else {
      setArtistFilter(new Set(value.map((a) => a.name)))
    }
  }

  return (
    <div className="flex items-center gap-2 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg">
      <Users size={14} className="text-white/40 shrink-0" />
      <ComboboxPrimitive.Root<ArtistEntry, true>
        multiple
        items={artists}
        itemToStringValue={(item) => item.name}
        value={selected}
        onValueChange={handleValueChange}
      >
        <ComboboxChips
          ref={anchorRef}
          className="min-h-0 flex-wrap items-center gap-1 rounded-none border-none bg-transparent p-0 shadow-none focus-within:ring-0"
        >
          {selected.map((artist) => (
            <ComboboxChip
              key={artist.name}
              className="bg-white/10 text-white/80 text-[10px] font-mono"
            >
              {artist.name}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            placeholder={selected.length === 0 ? "Filter artists..." : ""}
            className="bg-transparent text-white/80 text-xs font-mono placeholder:text-white/30 outline-none w-28 min-w-8"
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchorRef}>
          <ComboboxEmpty>No artists found.</ComboboxEmpty>
          <ComboboxList>
            {(item: ArtistEntry) => (
              <ComboboxItem key={item.name} value={item}>
                <span className="min-w-0 flex-1 truncate text-xs font-mono">
                  {item.name}
                </span>
                <span className="text-muted-foreground text-[10px] font-mono shrink-0 ml-2">
                  {item.count} tracks
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </ComboboxPrimitive.Root>
    </div>
  )
}
