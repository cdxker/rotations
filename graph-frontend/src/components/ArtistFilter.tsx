import { useEffect, useMemo, useRef } from "react"
import { Users } from "lucide-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
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
  const { artists: urlArtists } = useSearch({ from: "/user/$username" })
  const navigate = useNavigate()
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

  // Initialize selected from URL params once artists are loaded
  const selected = useMemo(() => {
    if (!urlArtists?.length) return []
    const urlSet = new Set(urlArtists)
    return artists.filter((a) => urlSet.has(a.name))
  }, [urlArtists, artists])

  // Sync artist filter to context whenever selected changes
  useEffect(() => {
    if (!artists.length) return
    if (selected.length === 0) {
      setArtistFilter(null)
    } else {
      setArtistFilter(new Set(selected.map((a) => a.name)))
    }
  }, [selected, setArtistFilter, artists.length])

  function handleValueChange(value: ArtistEntry[]) {
    const names = value.map((a) => a.name)
    void navigate({
      from: "/user/$username",
      search: (prev) => ({ ...prev, artists: names.length ? names : undefined }),
      replace: true,
    })
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
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </ComboboxPrimitive.Root>
    </div>
  )
}
