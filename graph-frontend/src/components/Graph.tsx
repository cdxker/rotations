import { useEffect, useMemo, useState } from 'react'
import { useLoadGraph, useSigma } from '@react-sigma/core'
import { type DateRange } from 'react-day-picker'
import { useGraph } from '../contexts/graphContext'
import setNodePositions, { type LayoutMode } from '../graph-utils/setNodePositions'

export function Graph({ layout, dateRange, isDark }: { layout: LayoutMode; dateRange: DateRange | undefined; isDark: boolean }) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()
  const { graph } = useGraph()
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  const selectedNeighbors = useMemo(() => {
    if (!selectedNode || !graph) return null
    const neighbors = new Set<string>()
    neighbors.add(selectedNode)
    graph.forEachNeighbor(selectedNode, (neighbor) => {
      neighbors.add(neighbor)
    })
    return neighbors
  }, [selectedNode, graph])

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

  useEffect(() => {
    if (graph) {
      setNodePositions(graph, layout)
      sigma.refresh()
      loadGraph(graph)
    }
  }, [graph, layout, loadGraph])

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

  const maxMetric = useMemo(() => {
    if (!nodeMetrics) return 1
    let max = 1e-10

    if (filteredPlayCounts) {
      for (const key of filteredPlayCounts.keys()) {
        const val = nodeMetrics.get(key)
        if (val !== undefined && val > max) max = val
      }
    } else {
      for (const val of nodeMetrics.values()) {
        if (val > max) max = val
      }
    }

    return max
  }, [nodeMetrics, filteredPlayCounts])

  useEffect(() => {
    if (!sigma) return
    const g = sigma.getGraph()
    const edgeBase = isDark
      ? (a: number) => `rgba(68, 68, 68, ${a})`
      : (a: number) => `rgba(0, 0, 0, ${a})`

    sigma.setSetting('labelColor', { color: isDark ? '#ffffff' : '#000000' })

    sigma.setSetting('nodeReducer', (_node: string, data: Record<string, unknown>) => {
      if (filteredPlayCounts && !filteredPlayCounts.has(_node)) {
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
      if (filteredPlayCounts) {
        if (!filteredPlayCounts.has(source) || !filteredPlayCounts.has(target)) {
          return { ...data, hidden: true }
        }
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
  }, [filteredPlayCounts, selectedNeighbors, nodeMetrics, maxMetric, sigma, isDark])

  return null
}
