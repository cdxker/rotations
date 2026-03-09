import { useEffect, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import '@react-sigma/core/lib/style.css'
import { useGraph } from '../contexts/graphContext'
import type { LayoutMode } from '#/lib/types'
import { DatePicker } from '#/components/date-picker'
import { SunIcon, MoonIcon, PanelRightIcon } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'
import { DepthSliders } from '../components/DepthSliders'
import { ArtistFilter } from '../components/ArtistFilter'
import { SelectionPanel } from '../components/SelectionPanel'
import { SidebarProvider, useSidebar } from '#/components/ui/sidebar'

type SigmaRuntime = {
  SigmaContainer: ComponentType<{
    style: CSSProperties
    settings: Record<string, unknown>
    children: ReactNode
  }>
  Graph: ComponentType<{ layout: LayoutMode; isDark: boolean }>
  EdgeArrowProgram: unknown
  NodePointProgram: unknown
}

function SidebarToggle() {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      className="px-3 py-1.5 text-sm bg-neutral-800 dark:bg-white text-white dark:text-black"
      onClick={toggleSidebar}
    >
      <PanelRightIcon className="size-4" />
    </button>
  )
}

function RightSidebar() {
  const { open } = useSidebar()
  return (
    <div
      className="fixed top-0 right-0 h-screen z-20 overflow-hidden transition-[width] duration-200 ease-linear bg-sidebar text-sidebar-foreground"
      style={{ width: open ? '16rem' : '0' }}
    >
      <div className="w-64 h-full">
        <SelectionPanel />
      </div>
    </div>
  )
}

function useContainerSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return size
}

export function MusicGraph() {
  const { state, error, layout } = useGraph()
  const [isDark, setIsDark] = useState(true)
  const [sigmaRuntime, setSigmaRuntime] = useState<SigmaRuntime | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const containerSize = useContainerSize(mainRef)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  useEffect(() => {
    let cancelled = false

    if (typeof window === 'undefined') return

    void Promise.all([
      import('@react-sigma/core'),
      import('sigma/rendering'),
      import('../components/Graph'),
    ])
      .then(([sigmaCore, sigmaRendering, graphModule]) => {
        if (cancelled) return
        setSigmaRuntime({
          SigmaContainer: sigmaCore.SigmaContainer,
          Graph: graphModule.Graph,
          EdgeArrowProgram: sigmaRendering.EdgeArrowProgram,
          NodePointProgram: sigmaRendering.NodePointProgram,
        })
      })
      .catch((err) => {
        console.error('Failed to load sigma runtime', err)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') return <div className="bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center">Loading graph…</div>
  if (state === 'building') return <div className="bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center">Building your graph…</div>
  if (state === 'error') return <div className="bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center">Error: {error}</div>
  if (!sigmaRuntime) return <div className="bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center">Loading renderer…</div>

  const { SigmaContainer, Graph, EdgeArrowProgram, NodePointProgram } = sigmaRuntime

  return (
    <SidebarProvider defaultOpen={false}>
    <main className="bg-white dark:bg-black text-black dark:text-white min-h-screen">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <DatePicker />
          <SearchBar />
          <ArtistFilter />
        </div>
        <DepthSliders />
      </div>
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          className="px-3 py-1.5  text-sm bg-neutral-800 dark:bg-white text-white dark:text-black"
          onClick={() => setIsDark(!isDark)}
        >
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </button>
        <SidebarToggle />
      </div>
      <SigmaContainer
        style={{ height: '100vh', width: '100vw', backgroundColor: 'transparent' }}
        settings={{
          labelRenderedSizeThreshold: 0,
          maxCameraRatio: 4,
          minCameraRatio: 0.1,
          defaultNodeType: 'point',
          defaultEdgeType: 'arrow',
          nodeProgramClasses: { point: NodePointProgram },
          edgeProgramClasses: { arrow: EdgeArrowProgram },
          defaultDrawNodeHover: () => {},
          labelColor: { color: isDark ? '#ffffff' : '#000000' },
        }}
      >
        <Graph layout={layout} isDark={isDark} />
      </SigmaContainer>
    </main>
    <RightSidebar />
    </SidebarProvider>
  )
}
