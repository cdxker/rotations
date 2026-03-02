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

  // Build a set of node keys that fall within the selected date range
  const matchingNodes = useMemo(() => {
    if (!dateRange?.from || !graph) return null
    const fromStr = dateRange.from.toISOString().slice(0, 10)
    const toStr = (dateRange.to ?? dateRange.from).toISOString().slice(0, 10)
    const matches = new Set<string>()
    graph.forEachNode((key, attrs) => {
      if (attrs.playDates?.some((d: string) => {
        const day = d.slice(0, 10)
        return day >= fromStr && day <= toStr
      })) {
        matches.add(key)
      }
    })
    return matches
  }, [dateRange, graph])

  // Update sigma reducers to hide nodes/edges not matching the filter
  useEffect(() => {
    if (!sigma) return
    const g = sigma.getGraph()
    sigma.setSetting('nodeReducer', (_node: string, data: Record<string, unknown>) => {
      if (!matchingNodes) return { ...data }
      if (matchingNodes.has(_node)) return { ...data }
      return { ...data, hidden: true }
    })
    sigma.setSetting('edgeReducer', (edge: string, data: Record<string, unknown>) => {
      if (!matchingNodes) return { ...data }
      const source = g.source(edge)
      const target = g.target(edge)
      if (matchingNodes.has(source) && matchingNodes.has(target)) return { ...data }
      return { ...data, hidden: true }
    })
    sigma.refresh()
  }, [matchingNodes, sigma])

  return null
}

function App() {
  const { state, error } = useGraph()
  const [layout, setLayout] = useState<LayoutMode>('pagerank')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  if (state === 'loading') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Loading graph…</div>
  if (state === 'error') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Error: {error}</div>

  return (
    <main className="bg-black text-white min-h-screen">
      <div className="absolute top-4 left-4 z-10">
        <DatePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
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
