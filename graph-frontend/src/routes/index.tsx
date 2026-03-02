import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SigmaContainer, useLoadGraph, useSigma } from '@react-sigma/core'
import { NodePointProgram } from 'sigma/rendering'
import '@react-sigma/core/lib/style.css'
import { useGraph } from '../contexts/graphContext'
import setNodePositions, { type LayoutMode } from '../graph-utils/setNodePositions'

export const Route = createFileRoute('/')({ component: App })

function LoadGraph({ layout }: { layout: LayoutMode }) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()
  const { graph } = useGraph()

  useEffect(() => {
    if (graph) {
      setNodePositions(graph, layout)
      loadGraph(graph)
    }
  }, [graph, loadGraph])

  useEffect(() => {
    if (graph) {
      setNodePositions(graph, layout)
      sigma.refresh()
    }
  }, [layout])

  return null
}

function App() {
  const { state, error } = useGraph()
  const [layout, setLayout] = useState<LayoutMode>('pagerank')

  if (state === 'loading') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Loading graph…</div>
  if (state === 'error') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Error: {error}</div>

  return (
    <main className="bg-black text-white min-h-screen">
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
          nodeReducer: (_node, data) => ({
            ...data,
          }),
        }}
      >
        <LoadGraph layout={layout} />
      </SigmaContainer>
    </main>
  )
}
