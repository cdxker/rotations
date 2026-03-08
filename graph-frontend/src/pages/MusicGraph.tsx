import { useEffect, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import '@react-sigma/core/lib/style.css'
import { useGraph } from '../contexts/graphContext'
import type { LayoutMode } from '../graph-utils/setNodePositions'
import { DatePicker } from '#/components/date-picker'
import { SunIcon, MoonIcon } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'

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

export function MusicGraph() {
  const { state, error, layout, setLayout } = useGraph()
  const [isDark, setIsDark] = useState(true)
  const [sigmaRuntime, setSigmaRuntime] = useState<SigmaRuntime | null>(null)

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
    <main className="bg-white dark:bg-black text-black dark:text-white min-h-screen">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
        <DatePicker />
        <SearchBar />
      </div>
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          className={`px-3 py-1.5  text-sm ${layout === 'pagerank' ? 'bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white' : 'bg-neutral-800 dark:bg-white text-white dark:text-black'}`}
          onClick={() => setLayout('pagerank')}
        >
          PageRank
        </button>
        <button
          className={`px-3 py-1.5  text-sm ${layout === 'mds' ? 'bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white' : 'bg-neutral-800 dark:bg-white text-white dark:text-black'}`}
          onClick={() => setLayout('mds')}
        >
          MDS
        </button>
        <button
          className={`px-3 py-1.5  text-sm ${layout === 'weighted-mds' ? 'bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white' : 'bg-neutral-800 dark:bg-white text-white dark:text-black'}`}
          onClick={() => setLayout('weighted-mds')}
        >
          Weighted MDS
        </button>
        <button
          className="px-3 py-1.5  text-sm bg-neutral-800 dark:bg-white text-white dark:text-black"
          onClick={() => setIsDark(!isDark)}
        >
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </button>
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
  )
}
