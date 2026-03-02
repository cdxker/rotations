import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SigmaContainer, useLoadGraph, useSigma } from '@react-sigma/core'
import { NodePointProgram } from 'sigma/rendering'
import '@react-sigma/core/lib/style.css'
import { type DateRange } from 'react-day-picker'
import { useGraph } from '../contexts/graphContext'
import setNodePositions, { type LayoutMode } from '../graph-utils/setNodePositions'
import { DatePicker } from '#/components/date-picker'

export const Route = createFileRoute('/')({ component: App })

function RenderGraph({ layout, dateRange }: { layout: LayoutMode; dateRange: DateRange | undefined }) {
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
    sigma.setSetting('nodeReducer', (_node: string, data: Record<string, unknown>) => {
      if (!filteredPlayCounts) return { ...data }
      const count = filteredPlayCounts.get(_node)
      if (!count) return { ...data, hidden: true }
      const size = 4 + (16 * Math.log(count)) / Math.log(maxPlaysInRange)
      return { ...data, size }
    })
    sigma.setSetting('edgeReducer', (edge: string, data: Record<string, unknown>) => {
      if (!filteredPlayCounts) return { ...data }
      const source = g.source(edge)
      const target = g.target(edge)
      if (filteredPlayCounts.has(source) && filteredPlayCounts.has(target)) return { ...data }
      return { ...data, hidden: true }
    })
    sigma.refresh()
  }, [filteredPlayCounts, maxPlaysInRange, sigma])

  return null
}

function App() {
  const { state, error, graph } = useGraph()
  const [layout, setLayout] = useState<LayoutMode>('pagerank')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  // Collect all unique play dates (day-level strings, sorted) from the graph
  const allPlayDays = useMemo(() => {
    if (!graph) return []
    const days = new Set<string>()
    graph.forEachNode((_key, attrs) => {
      for (const d of (attrs.playDates ?? [])) {
        days.add(d.slice(0, 10))
      }
    })
    return [...days].sort()
  }, [graph])

  if (state === 'loading') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Loading graph…</div>
  if (state === 'error') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Error: {error}</div>

  return (
    <main className="bg-black text-white min-h-screen">
      <div className="absolute top-4 left-4 z-10">
        <DatePicker dateRange={dateRange} onDateRangeChange={setDateRange} allPlayDays={allPlayDays} />
      </div>
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          className={`px-3 py-1.5 rounded text-sm ${layout === 'pagerank' ?  'bg-neutral-800 text-white':'bg-white text-black'  }`}
          onClick={() => setLayout('pagerank')}
        >
          PageRank
        </button>
        <button
          className={`px-3 py-1.5 rounded text-sm ${layout === 'mds' ?  'bg-neutral-800 text-white': 'bg-white text-black' }`}
          onClick={() => setLayout('mds')}
        >
          MDS
        </button>
        <button
          className={`px-3 py-1.5 rounded text-sm ${layout === 'weighted-mds' ?  'bg-neutral-800 text-white': 'bg-white text-black' }`}
          onClick={() => setLayout('weighted-mds')}
        >
          Weighted MDS
        </button>
      </div>
      <SigmaContainer
        style={{ height: '100vh', width: '100vw' }}
        settings={{
          labelRenderedSizeThreshold: 0,
          maxCameraRatio: 4,
          minCameraRatio: 0.1,
          defaultNodeType: 'point',
          nodeProgramClasses: { point: NodePointProgram },
          defaultDrawNodeHover: () => {},
        }}
      >
        <RenderGraph layout={layout} dateRange={dateRange} />
      </SigmaContainer>
    </main>
  )
}
