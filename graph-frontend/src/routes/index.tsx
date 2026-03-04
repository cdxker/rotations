import { useEffect, useMemo, useState, useCallback } from 'react'
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

interface EdgeTooltip {
  x: number
  y: number
  sourceLabel: string
  targetLabel: string
  timestamps: string[]
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function RenderGraph({ layout, dateRange, isDark, onEdgeHover }: { layout: LayoutMode; dateRange: DateRange | undefined; isDark: boolean; onEdgeHover: (tooltip: EdgeTooltip | null) => void }) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()
  const { graph, raw } = useGraph()
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Build set of neighbors for the selected node
  const selectedNeighbors = useMemo(() => {
    if (!selectedNode || !graph) return null
    const neighbors = new Set<string>()
    neighbors.add(selectedNode)
    graph.forEachNeighbor(selectedNode, (neighbor) => {
      neighbors.add(neighbor)
    })
    return neighbors
  }, [selectedNode, graph])

  // Listen for click events on sigma
  useEffect(() => {
    if (!sigma) return
    const handleClickNode = ({ node }: { node: string }) => {
      setSelectedNode((prev) => (prev === node ? null : node))
    }
    const handleClickStage = () => {
      setSelectedNode(null)
    }
    sigma.on('clickNode', handleClickNode)
    sigma.on('clickStage', handleClickStage)
    return () => {
      sigma.off('clickNode', handleClickNode)
      sigma.off('clickStage', handleClickStage)
    }
  }, [sigma])

  // Edge hover tooltip
  useEffect(() => {
    if (!sigma || !graph) return
    const handleEnterEdge = ({ edge, event }: { edge: string; event: { original: MouseEvent } }) => {
      const g = sigma.getGraph()
      const source = g.source(edge)
      const target = g.target(edge)
      const attrs = g.getEdgeAttributes(edge)
      const sourceLabel = g.getNodeAttribute(source, 'label') ?? source
      const targetLabel = g.getNodeAttribute(target, 'label') ?? target
      onEdgeHover({
        x: event.original.clientX,
        y: event.original.clientY,
        sourceLabel,
        targetLabel,
        timestamps: (attrs.timestamps as string[]) ?? [],
      })
    }
    const handleLeaveEdge = () => {
      onEdgeHover(null)
    }
    sigma.on('enterEdge', handleEnterEdge)
    sigma.on('leaveEdge', handleLeaveEdge)
    return () => {
      sigma.off('enterEdge', handleEnterEdge)
      sigma.off('leaveEdge', handleLeaveEdge)
    }
  }, [sigma, graph, onEdgeHover])

  useEffect(() => {
    if (graph) {
      setNodePositions(graph, layout)
      sigma.refresh()
      loadGraph(graph)
    }
  }, [graph, layout, loadGraph])

  // Date filtering: compute filtered edge weights and visible nodes from raw edge timestamps
  const dateFilter = useMemo(() => {
    if (!dateRange?.from || !raw) return null
    const fromStr = dateRange.from.toISOString().slice(0, 10)
    const toStr = (dateRange.to ?? dateRange.from).toISOString().slice(0, 10)

    // Count edges within date range, grouped by (from, to)
    const edgeWeights = new Map<string, number>()
    const visibleNodes = new Set<string>()

    for (const edge of raw.edges) {
      const day = edge.timestamp.slice(0, 10)
      if (day >= fromStr && day <= toStr) {
        const mapKey = `${edge.from}→${edge.to}`
        edgeWeights.set(mapKey, (edgeWeights.get(mapKey) ?? 0) + 1)
        visibleNodes.add(edge.from)
        visibleNodes.add(edge.to)
      }
    }

    // Also include nodes that have playDates within range (even if they have no edges)
    if (graph) {
      graph.forEachNode((key, attrs) => {
        for (const d of (attrs.playDates ?? [])) {
          const day = d.slice(0, 10)
          if (day >= fromStr && day <= toStr) {
            visibleNodes.add(key)
            break
          }
        }
      })
    }

    return { edgeWeights, visibleNodes }
  }, [dateRange, raw, graph])

  // Compute per-node sizing metric based on the active layout algorithm
  const nodeMetrics = useMemo(() => {
    if (!graph) return null
    const metrics = new Map<string, number>()

    if (layout === 'pagerank') {
      graph.forEachNode((key, attrs) => {
        metrics.set(key, attrs.pageRank)
      })
    } else if (layout === 'mds') {
      graph.forEachNode((key) => {
        metrics.set(key, graph.degree(key))
      })
    } else {
      // weighted-mds: weighted degree (sum of edge weights)
      graph.forEachNode((key) => {
        let wd = 0
        graph.forEachEdge(key, (_edge, attrs) => {
          wd += attrs.weight
        })
        metrics.set(key, wd)
      })
    }

    return metrics
  }, [graph, layout])

  // Max metric among active (visible) nodes only, so sizes rescale dynamically
  const maxMetric = useMemo(() => {
    if (!nodeMetrics) return 1
    let max = 1e-10

    if (dateFilter) {
      for (const key of dateFilter.visibleNodes) {
        const val = nodeMetrics.get(key)
        if (val !== undefined && val > max) max = val
      }
    } else {
      for (const val of nodeMetrics.values()) {
        if (val > max) max = val
      }
    }

    return max
  }, [nodeMetrics, dateFilter])

  // Update sigma reducers to hide nodes/edges not matching the filter and rescale sizes
  useEffect(() => {
    if (!sigma) return
    const g = sigma.getGraph()
    const edgeBase = isDark
      ? (a: number) => `rgba(68, 68, 68, ${a})`
      : (a: number) => `rgba(0, 0, 0, ${a})`

    sigma.setSetting('labelColor', { color: isDark ? '#ffffff' : '#000000' })

    sigma.setSetting('nodeReducer', (_node: string, data: Record<string, unknown>) => {
      if (dateFilter && !dateFilter.visibleNodes.has(_node)) {
        return { ...data, hidden: true }
      }
      if (selectedNeighbors && !selectedNeighbors.has(_node)) {
        return { ...data, hidden: true }
      }
      const metric = nodeMetrics?.get(_node) ?? 0
      const size = metric > 0 && maxMetric > 0
        ? 4 + 16 * Math.log1p(metric) / Math.log1p(maxMetric)
        : 4
      return { ...data, size }
    })
    sigma.setSetting('edgeReducer', (edge: string, data: Record<string, unknown>) => {
      const source = g.source(edge)
      const target = g.target(edge)

      if (dateFilter) {
        const mapKey = `${source}→${target}`
        const filteredWeight = dateFilter.edgeWeights.get(mapKey)
        if (!filteredWeight) {
          return { ...data, hidden: true }
        }
        // Use filtered weight for visual sizing
        return { ...data, color: edgeBase(Math.min(0.6, 0.15 + filteredWeight * 0.05)) }
      }

      if (selectedNeighbors) {
        if (!selectedNeighbors.has(source) || !selectedNeighbors.has(target)) {
          return { ...data, hidden: true }
        }
      }
      const w = (data as { weight?: number }).weight ?? 1
      return { ...data, color: edgeBase(Math.min(0.6, 0.15 + w * 0.05)) }
    })
    sigma.refresh()
  }, [dateFilter, selectedNeighbors, nodeMetrics, maxMetric, sigma, isDark])

  return null
}

function App() {
  const { state, error } = useGraph()
  const [layout, setLayout] = useState<LayoutMode>('pagerank')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [isDark, setIsDark] = useState(true)
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltip | null>(null)
  const handleEdgeHover = useCallback((t: EdgeTooltip | null) => setEdgeTooltip(t), [])

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
          enableEdgeEvents: true,
        }}
      >
        <RenderGraph layout={layout} dateRange={dateRange} isDark={isDark} onEdgeHover={handleEdgeHover} />
      </SigmaContainer>
      {edgeTooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 text-xs max-w-xs bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 shadow-lg"
          style={{ left: edgeTooltip.x + 12, top: edgeTooltip.y + 12 }}
        >
          <div className="font-medium mb-1">{edgeTooltip.sourceLabel} &rarr; {edgeTooltip.targetLabel}</div>
          <div className="text-[10px] opacity-70 mb-1">{edgeTooltip.timestamps.length} transition{edgeTooltip.timestamps.length !== 1 ? 's' : ''}</div>
          <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
            {edgeTooltip.timestamps.slice().sort().map((ts, i) => (
              <span key={i} className="tabular-nums">{formatTimestamp(ts)}</span>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
