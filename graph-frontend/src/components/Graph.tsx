import { useEffect, useMemo } from 'react'
import { useLoadGraph, useSigma } from '@react-sigma/core'
import { useGraph } from '../contexts/graphContext'
import type { LayoutMode } from '../graph-utils/setNodePositions'

export function Graph({ layout, isDark }: { layout: LayoutMode; isDark: boolean }) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()
  const { graph, filteredPlayCounts, nodeMetrics, selectedNode, setSelectedNode } = useGraph()

  const metricKey =
    layout === "pagerank" ? "pageRank"
    : layout === "mds" ? "mdsScore"
    : "weightedMdsScore" as const

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
    const handleClickNode = ({ node }: { node: string }) => {
      setSelectedNode(selectedNode === node ? null : node)
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
  }, [sigma, selectedNode, setSelectedNode])

  useEffect(() => {
    if (graph) {
      sigma.refresh()
      loadGraph(graph)
    }
  }, [graph, layout, loadGraph])

  const maxMetric = useMemo(() => {
    if (!nodeMetrics) return 1
    let max = 1e-10

    const resolve = (id: string) => nodeMetrics[id]?.[metricKey] ?? 0

    if (filteredPlayCounts) {
      for (const key of filteredPlayCounts.keys()) {
        const val = resolve(key)
        if (val > max) max = val
      }
    } else {
      for (const id of Object.keys(nodeMetrics)) {
        const val = resolve(id)
        if (val > max) max = val
      }
    }

    return max
  }, [nodeMetrics, filteredPlayCounts, metricKey])

  useEffect(() => {
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
      const metric = nodeMetrics?.[_node]?.[metricKey] ?? 0
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
  }, [filteredPlayCounts, selectedNeighbors, nodeMetrics, maxMetric, metricKey, sigma, isDark])

  return null
}
