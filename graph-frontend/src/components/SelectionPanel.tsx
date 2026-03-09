import { useMemo } from "react"
import { X, PanelRightCloseIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useGraph } from "../contexts/graphContext"
import {
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from "#/components/ui/sidebar"

export function SelectionPanel() {
  const { graph, selectedNodes, visibleNodes, toggleSelectedNode, clearSelection, selectAllVisible } = useGraph()
  const { toggleSidebar } = useSidebar()
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

  return (
    <>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              <PanelRightCloseIcon className="size-4" />
            </button>
            <span className="text-sidebar-foreground/60 text-xs font-mono">
              {items.length} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {visibleNodes && visibleNodes.size > selectedNodes.size && (
              <button
                onClick={selectAllVisible}
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground/80 text-xs font-mono transition-colors"
              >
                Select visible
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => {
                  clearSelection()
                  void navigate({
                    from: "/user/$username",
                    search: (prev) => ({ ...prev, artists: undefined }),
                    replace: true,
                  })
                }}
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground/80 text-xs font-mono transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="flex flex-col gap-1">
              {items.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent group"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-6 h-6 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded bg-sidebar-foreground/10 shrink-0" />
                  )}
                  <span className="text-sidebar-foreground/80 text-[11px] font-mono truncate flex-1 min-w-0">
                    {item.label}
                  </span>
                  <button
                    onClick={() => toggleSelectedNode(item.id)}
                    className="text-sidebar-foreground/20 hover:text-sidebar-foreground/60 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}
