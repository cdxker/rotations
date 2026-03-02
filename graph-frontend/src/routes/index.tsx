import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SigmaContainer, useLoadGraph } from '@react-sigma/core'
import { NodePointProgram } from 'sigma/rendering'
import '@react-sigma/core/lib/style.css'
import { useGraph } from '../contexts/graphContext'

export const Route = createFileRoute('/')({ component: App })

function LoadGraph() {
  const loadGraph = useLoadGraph()
  const { graph } = useGraph()

  useEffect(() => {
    if (graph) {
      loadGraph(graph)
    }
  }, [graph, loadGraph])

  return null
}

function App() {
  const { state, error } = useGraph()

  if (state === 'loading') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Loading graph…</div>
  if (state === 'error') return <div className="bg-black text-white min-h-screen flex items-center justify-center">Error: {error}</div>

  return (
    <main className="bg-black text-white min-h-screen">
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
        <LoadGraph />
      </SigmaContainer>
    </main>
  )
}
