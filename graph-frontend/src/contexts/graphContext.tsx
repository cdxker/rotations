import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type {ReactNode} from "react";
import type {DateRange} from "react-day-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Graph from "graphology"
import type { EdgeAttributes, ListeningGraph, NodeAttributes } from "#/lib/types"

const GRAPH_API_BASE =
  import.meta.env.VITE_GRAPH_API_URL ?? "http://localhost:3001"

export type PipelineJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

interface PipelineJobStatusRecord {
  id: string
  status: PipelineJobStatus
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

function toGraphology(
  listeningGraph: ListeningGraph,
): Graph<NodeAttributes, EdgeAttributes> {
  const graph = new Graph<NodeAttributes, EdgeAttributes>()
  const entries = Object.entries(listeningGraph.nodes)

  if (entries.length === 0) return graph

  let maxPageRank = 1e-10
  for (const [, n] of entries) {
    const pr = n.pageRank ?? 0
    if (pr > maxPageRank) maxPageRank = pr
  }

  for (const [uuid, node] of entries) {
    graph.addNode(uuid, {
      label: `${node.artists[0] ?? "Unknown"} — ${node.name}`,
      songKey: node.songKey,
      artists: node.artists,
      albumName: node.albumName,
      lastfmUrl: node.lastfmUrl,
      imageUrl: node.imageUrl,
      totalPlays: node.totalPlays,
      sources: node.sources,
      pageRank: node.pageRank ?? 0,
      playDates: node.playDates,
      positions: node.positions,
      size: 4,
      color: "#ffffff",
      x: 0,
      y: 0,
    })
  }

  for (const [fromUuid, node] of entries) {
    for (const [toUuid, weight] of Object.entries(node.next)) {
      if (!graph.hasNode(toUuid)) continue
      if (graph.hasEdge(fromUuid, toUuid)) continue

      graph.addDirectedEdge(fromUuid, toUuid, {
        weight,
        size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
        color: `rgba(0, 0, 0, ${Math.min(0.6, 0.15 + weight * 0.05)})`,
      })
    }
  }

  return graph
}

export type LoadState = "loading" | "building" | "loaded" | "error"

type GraphContextValue = {
  graph: Graph<NodeAttributes, EdgeAttributes> | null
  raw: ListeningGraph | null
  state: LoadState
  error: string | null
  jobStatus: PipelineJobStatus | null
  dateRange: DateRange | undefined
  setDateRange: (range: DateRange | undefined) => void
};

const GraphContext = createContext<GraphContextValue | null>(null)

export function GraphProvider({ children, initialUser }: { children: ReactNode, initialUser: string }) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [jobId, setJobId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isPending, isError, error: graphError } = useQuery({
    queryKey: ["graph", initialUser],
    queryFn: async () => {
      const response = await fetch(`${GRAPH_API_BASE}/graph?user=${encodeURIComponent(initialUser)}`)
      if (response.status === 404) {
        const pipelineRes = await fetch(`${GRAPH_API_BASE}/pipeline/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: initialUser }),
        })
        if (pipelineRes.ok) {
          const { jobId: id } = await pipelineRes.json() as { jobId: string }
          setJobId(id)
        }
        return null
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch graph: ${response.status} ${response.statusText}`)
      }
      return response.json() as Promise<ListeningGraph>
    },
    retry: false,
  })

  const { data: jobData } = useQuery({
    queryKey: ["pipeline-job", jobId],
    queryFn: async () => {
      const res = await fetch(`${GRAPH_API_BASE}/pipeline/run/${jobId}`)
      if (!res.ok) throw new Error("Failed to fetch job status")
      return res.json() as Promise<PipelineJobStatusRecord>
    },
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === "succeeded" || status === "failed" || status === "cancelled") {
        return false // stop polling
      }
      return 2000
    },
  })

  useEffect(() => {
    if (jobData?.status === "succeeded") {
      setJobId(null)
      void queryClient.invalidateQueries({ queryKey: ["graph", initialUser] })
    }
  }, [jobData?.status, initialUser, queryClient])

  const graph = useMemo(() => (data ? toGraphology(data) : null), [data])

  const jobStatus = jobData?.status ?? null
  const isBuilding = jobId !== null && jobStatus !== "failed" && jobStatus !== "cancelled"

  const state: LoadState = isPending
    ? "loading"
    : isBuilding
      ? "building"
      : isError
        ? "error"
        : data === null
          ? "loading"
          : "loaded"

  const value: GraphContextValue = useMemo(() => ({
    graph,
    raw: data ?? null,
    state,
    error: isError ? graphError.message : jobStatus === "failed" ? "Pipeline job failed" : null,
    jobStatus,
    dateRange,
    setDateRange,
  }), [graph, data, state, isError, graphError, jobStatus, dateRange])

  return (
    <GraphContext.Provider value={value}>
      {children}
    </GraphContext.Provider>
  )
}

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext)
  if (!ctx) {
    throw new Error("useGraph must be used within a <GraphProvider>")
  }
  return ctx
}
