import { useEffect, useState } from "react"
import Graph from "graphology"
import { fetchGraph, toGraphology } from "@/lib/graph-api"

export type LoadState = "loading" | "loaded" | "error"

/**
 * Fetch graph data from the API and build a graphology Graph.
 * Sets an error state if the API is unreachable.
 */
export function useGraphData(): { graph: Graph | null; state: LoadState; error: string | null } {
    const [graph, setGraph] = useState<Graph | null>(null)
    const [state, setState] = useState<LoadState>("loading")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                const data = await fetchGraph()
                if (cancelled) return

                const g = toGraphology(data)
                setGraph(g)
                setState("loaded")
            } catch {
                if (cancelled) return
                setState("error")
                setError("Could not reach graph API")
            }
        }

        load()
        return () => {
            cancelled = true
        }
    }, [])

    return { graph, state, error }
}
