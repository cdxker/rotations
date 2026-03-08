import { useEffect, useState } from 'react'
import { SigmaContainer } from '@react-sigma/core'
import { EdgeArrowProgram, NodePointProgram } from 'sigma/rendering'
import '@react-sigma/core/lib/style.css'
import { type DateRange } from 'react-day-picker'
import { useGraph } from '../contexts/graphContext'
import { type LayoutMode } from '../graph-utils/setNodePositions'
import { DatePicker } from '#/components/date-picker'
import { Graph } from '../components/Graph'
import { SunIcon, MoonIcon } from 'lucide-react'

export function MusicGraph() {
  const { state, error } = useGraph()
  const [layout, setLayout] = useState<LayoutMode>('pagerank')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  if (state === 'loading') return <div className="bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center">Loading graph…</div>
  if (state === 'error') return <div className="bg-white dark:bg-black text-black dark:text-white min-h-screen flex items-center justify-center">Error: {error}</div>

  return (
    <main className="bg-white dark:bg-black text-black dark:text-white min-h-screen">
      <div className="absolute top-4 left-4 z-10">
        <DatePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
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
        <Graph layout={layout} dateRange={dateRange} isDark={isDark} />
      </SigmaContainer>
    </main>
  )
}
