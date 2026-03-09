import { useEffect, useMemo } from 'react'
import { useLoadGraph, useSigma } from '@react-sigma/core'
import { useGraph } from '../contexts/graphContext'
import type { LayoutMode } from '#/lib/types'

export function Graph({ layout, isDark }: { layout: LayoutMode; isDark: boolean }) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()
  const { graph, filteredPlayCounts, getNodeMetrics, selectedNodes, visibleNodes, toggleSelectedNode, clearSelection } = useGraph()

  const metricKey =
    layout === "pagerank" ? "pageRank"
    : layout === "mds" ? "mdsScore"
    : "weightedMdsScore" as const

  useEffect(() => {
    const handleClickNode = ({ node }: { node: string }) => {
      toggleSelectedNode(node)
    }
    const handleClickStage = () => {
      clearSelection()
    }
    sigma.on('clickNode', handleClickNode)
    sigma.on('clickStage', handleClickStage)
    return () => {
      sigma.off('clickNode', handleClickNode)
      sigma.off('clickStage', handleClickStage)
    }
  }, [sigma, toggleSelectedNode, clearSelection])

  useEffect(() => {
    if (graph) {
      sigma.refresh()
      loadGraph(graph)
    }
  }, [graph, layout, loadGraph])

  const maxMetric = useMemo(() => {
    if (!graph) return 1
    let max = 1e-10

    if (filteredPlayCounts) {
      for (const nodeId of filteredPlayCounts.keys()) {
        const score = getNodeMetrics(nodeId, layout)?.[metricKey] ?? 0
        if (score > max) max = score
      }
    } else {
      graph.forEachNode((nodeId) => {
        const score = getNodeMetrics(nodeId, layout)?.[metricKey] ?? 0
        if (score > max) max = score
      })
    }

    return max
  }, [graph, filteredPlayCounts, getNodeMetrics, layout, metricKey])

  useEffect(() => {
    const g = sigma.getGraph()
    const edgeBase = isDark
      ? (a: number) => `rgba(68, 68, 68, ${a})`
      : (a: number) => `rgba(0, 0, 0, ${a})`

    sigma.setSetting('labelColor', { color: isDark ? '#ffffff' : '#000000' })

    const isNodeHidden = (node: string): boolean => {
      if (filteredPlayCounts && !filteredPlayCounts.has(node)) return true
      if (visibleNodes && !visibleNodes.has(node)) return true
      return false
    }

    sigma.setSetting('nodeReducer', (node: string, data: Record<string, unknown>) => {
      if (isNodeHidden(node)) return { ...data, hidden: true }
      const metric = getNodeMetrics(node, layout)?.[metricKey] ?? 0
      const size = metric > 0 && maxMetric > 0
        ? 4 + 16 * Math.log1p(metric) / Math.log1p(maxMetric)
        : 4
      const color = selectedNodes.size > 0
        ? (selectedNodes.has(node) ? '#ffffff' : '#666666')
        : data.color as string
      return { ...data, size, color }
    })
    sigma.setSetting('edgeReducer', (edge: string, data: Record<string, unknown>) => {
      const source = g.source(edge)
      const target = g.target(edge)
      if (isNodeHidden(source) || isNodeHidden(target)) {
        return { ...data, hidden: true }
      }
      const w = (data as { weight?: number }).weight ?? 1
      return { ...data, color: edgeBase(Math.min(0.6, 0.15 + w * 0.05)) }
    })
    sigma.refresh()
  }, [filteredPlayCounts, visibleNodes, selectedNodes, getNodeMetrics, layout, metricKey, maxMetric, sigma, isDark])

  return null
}
