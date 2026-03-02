import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SigmaContainer, useLoadGraph, useSigma } from '@react-sigma/core'
import { EdgeArrowProgram, NodePointProgram } from 'sigma/rendering'
import '@react-sigma/core/lib/style.css'
import { type DateRange } from 'react-day-picker'
import { useGraph } from '../contexts/graphContext'
import setNodePositions, { type LayoutMode } from '../graph-utils/setNodePositions'
import { DatePicker } from '#/components/date-picker'
import { SunIcon, MoonIcon } from 'lucide-react'

export const Route = createFileRoute('/')({ component: App })

function RenderGraph({ layout, dateRange, isDark }: { layout: LayoutMode; dateRange: DateRange | undefined; isDark: boolean }) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()
  const { graph } = useGraph()

  useEffect(() => {
    if (graph) {
      setNodePositions(graph, layout)
      sigma.refresh()
      loadGraph(graph)
    }
  }, [graph, layout, loadGraph])

  // Build a map of node keys → play count within the selected date range
  const filteredPlayCounts = useMemo(() => {
    if (!dateRange?.from || !graph) return null
    const fromStr = dateRange.from.toISOString().slice(0, 10)
    const toStr = (dateRange.to ?? dateRange.from).toISOString().slice(0, 10)
    const counts = new Map<string, number>()
    graph.forEachNode((key, attrs) => {
      let count = 0
      for (const d of (attrs.playDates ?? [])) {
        const day = d.slice(0, 10)
        if (day >= fromStr && day <= toStr) count++
      }
      if (count > 0) counts.set(key, count)
    })
    return counts
  }, [dateRange, graph])

  // Pre-compute max plays in range for sizing
  const maxPlaysInRange = useMemo(() => {
    if (!filteredPlayCounts) return 1
    let max = 1
    for (const count of filteredPlayCounts.values()) {
      if (count > max) max = count
    }
    return max
  }, [filteredPlayCounts])

  // Update sigma reducers to hide nodes/edges not matching the filter and rescale sizes
  useEffect(() => {
    if (!sigma) return
    const g = sigma.getGraph()
    const edgeBase = isDark
      ? (a: number) => `rgba(68, 68, 68, ${a})`
      : (a: number) => `rgba(0, 0, 0, ${a})`

    sigma.setSetting('labelColor', { color: isDark ? '#ffffff' : '#000000' })

    sigma.setSetting('nodeReducer', (_node: string, data: Record<string, unknown>) => {
      if (!filteredPlayCounts) return { ...data }
      const count = filteredPlayCounts.get(_node)
      if (!count) return { ...data, hidden: true }
      const size = 4 + (16 * Math.log(count)) / Math.log(maxPlaysInRange)
      return { ...data, size }
    })
    sigma.setSetting('edgeReducer', (edge: string, data: Record<string, unknown>) => {
      if (!filteredPlayCounts) {
        const w = (data as { weight?: number }).weight ?? 1
        return { ...data, color: edgeBase(Math.min(0.6, 0.15 + w * 0.05)) }
      }
      const source = g.source(edge)
      const target = g.target(edge)
      if (filteredPlayCounts.has(source) && filteredPlayCounts.has(target)) {
        const w = (data as { weight?: number }).weight ?? 1
        return { ...data, color: edgeBase(Math.min(0.6, 0.15 + w * 0.05)) }
      }
      return { ...data, hidden: true }
    })
    sigma.refresh()
  }, [filteredPlayCounts, maxPlaysInRange, sigma, isDark])

  return null
}

function App() {
  const { state, error } = useGraph()
  const [layout, setLayout] = useState<LayoutMode>('pagerank')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [isDark, setIsDark] = useState(false)

  // Toggle .dark class on <html> so dark: variants work everywhere
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
          className={`px-3 py-1.5 rounded text-sm ${layout === 'pagerank' ? 'bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white' : 'bg-neutral-800 dark:bg-white text-white dark:text-black'}`}
          onClick={() => setLayout('pagerank')}
        >
          PageRank
        </button>
        <button
          className={`px-3 py-1.5 rounded text-sm ${layout === 'mds' ? 'bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white' : 'bg-neutral-800 dark:bg-white text-white dark:text-black'}`}
          onClick={() => setLayout('mds')}
        >
          MDS
        </button>
        <button
          className={`px-3 py-1.5 rounded text-sm ${layout === 'weighted-mds' ? 'bg-neutral-200 dark:bg-neutral-800 text-black dark:text-white' : 'bg-neutral-800 dark:bg-white text-white dark:text-black'}`}
          onClick={() => setLayout('weighted-mds')}
        >
          Weighted MDS
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm bg-neutral-800 dark:bg-white text-white dark:text-black"
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
        <RenderGraph layout={layout} dateRange={dateRange} isDark={isDark} />
      </SigmaContainer>
    </main>
  )
}
