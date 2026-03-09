import { useGraph } from "../contexts/graphContext"
import { Slider } from "#/components/ui/slider"

export function DepthSliders() {
  const { selectedNode, artistFilter, nextDepth, setNextDepth, prevDepth, setPrevDepth } = useGraph()

  if (!selectedNode && !artistFilter) return null

  return (
    <div className="flex items-center gap-3 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 shadow-lg">
      <label className="text-white/60 text-xs font-mono whitespace-nowrap">Prev</label>
      <Slider
        min={1}
        max={20}
        step={1}
        value={[prevDepth]}
        onValueChange={([v]) => setPrevDepth(v)}
        className="w-20"
      />
      <span className="text-white/80 text-xs font-mono w-3 text-center">{prevDepth}</span>

      <div className="w-px h-4 bg-white/20" />

      <label className="text-white/60 text-xs font-mono whitespace-nowrap">Next</label>
      <Slider
        min={1}
        max={20}
        step={1}
        value={[nextDepth]}
        onValueChange={([v]) => setNextDepth(v)}
        className="w-20"
      />
      <span className="text-white/80 text-xs font-mono w-3 text-center">{nextDepth}</span>
    </div>
  )
}
