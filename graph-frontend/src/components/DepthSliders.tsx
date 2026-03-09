import { useEffect } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useGraph } from "../contexts/graphContext"
import { Slider } from "#/components/ui/slider"

export function DepthSliders() {
  const { selectedNodes, nextDepth, setNextDepth, prevDepth, setPrevDepth } = useGraph()
  const { next: urlNext, prev: urlPrev } = useSearch({ from: "/user/$username" })
  const navigate = useNavigate()

  // Initialize context from URL params on mount
  useEffect(() => {
    if (urlNext != null && urlNext !== nextDepth) setNextDepth(urlNext)
    if (urlPrev != null && urlPrev !== prevDepth) setPrevDepth(urlPrev)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  if (selectedNodes.size === 0) return null

  function handlePrevChange([v]: number[]) {
    setPrevDepth(v)
    void navigate({
      from: "/user/$username",
      search: (prev) => ({ ...prev, prev: v !== 1 ? v : undefined }),
      replace: true,
    })
  }

  function handleNextChange([v]: number[]) {
    setNextDepth(v)
    void navigate({
      from: "/user/$username",
      search: (prev) => ({ ...prev, next: v !== 1 ? v : undefined }),
      replace: true,
    })
  }

  return (
    <div className="flex items-center gap-3 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg">
      <label className="text-white/60 text-xs font-mono whitespace-nowrap">Prev</label>
      <Slider
        min={0}
        max={20}
        step={1}
        value={[prevDepth]}
        onValueChange={handlePrevChange}
        className="w-20"
      />
      <span className="text-white/80 text-xs font-mono w-3 text-center">{prevDepth}</span>

      <div className="w-px h-4 bg-white/20" />

      <label className="text-white/60 text-xs font-mono whitespace-nowrap">Next</label>
      <Slider
        min={0}
        max={20}
        step={1}
        value={[nextDepth]}
        onValueChange={handleNextChange}
        className="w-20"
      />
      <span className="text-white/80 text-xs font-mono w-3 text-center">{nextDepth}</span>
    </div>
  )
}
