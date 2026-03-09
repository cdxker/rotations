import { useMemo } from "react"
import { X } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useGraph } from "../contexts/graphContext"

export function SelectionPanel() {
  const { graph, selectedNodes, toggleSelectedNode, clearSelection } = useGraph()
  const navigate = useNavigate()

  const items = useMemo(() => {
    if (!graph || selectedNodes.size === 0) return []
    return [...selectedNodes]
      .filter(id => graph.hasNode(id))
      .map(id => {
        const attrs = graph.getNodeAttributes(id)
        return { id, label: attrs.label, imageUrl: attrs.imageUrl }
      })
  }, [graph, selectedNodes])

  if (items.length === 0) return null

  return (
    <div className="absolute top-[50%] right-4 z-10 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-2xl shadow-lg max-h-[20vh] w-56 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-white/60 text-xs font-mono">
          {items.length} selected
        </span>
        <button
          onClick={() => {
            clearSelection()
            void navigate({
              from: "/user/$username",
              search: (prev) => ({ ...prev, artists: undefined }),
              replace: true,
            })
          }}
          className="text-white/40 hover:text-white/80 text-xs font-mono transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="overflow-y-auto flex-1 p-1.5 flex flex-col gap-1">
        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="w-6 h-6 rounded object-cover shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded bg-white/10 shrink-0" />
            )}
            <span className="text-white/80 text-[11px] font-mono truncate flex-1 min-w-0">
              {item.label}
            </span>
            <button
              onClick={() => toggleSelectedNode(item.id)}
              className="text-white/20 hover:text-white/60 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
