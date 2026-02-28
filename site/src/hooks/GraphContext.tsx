import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import type Graph from "graphology";
import type { ListeningGraph, GraphFilter, GraphMetadata } from "@/lib/graph-types";
import {
    fetchGraph,
    filterGraph,
    toGraphology,
    clearGraphCache,
} from "@/lib/graph-api";
import type { NodeAttributes, EdgeAttributes } from "@/lib/graph-api";

export type GraphStatus = "idle" | "loading" | "ready" | "error";

interface GraphContextValue {
    /** Current loading status. */
    status: GraphStatus;
    /** Error message if status is "error". */
    error: string | null;
    /** The graphology instance for Sigma.js (null until loaded). */
    graph: Graph<NodeAttributes, EdgeAttributes> | null;
    /** Raw graph metadata. */
    metadata: GraphMetadata | null;
    /** Total node count in the unfiltered graph. */
    totalNodes: number;
    /** Node count after filtering. */
    filteredNodes: number;
    /** Current active filter. */
    filter: GraphFilter;
    /** Update the filter (merges with current filter). */
    setFilter: (filter: GraphFilter) => void;
    /** Reset filter to show all nodes. */
    clearFilter: () => void;
    /** Re-fetch graph data from the API. */
    refresh: () => void;
}

const GraphContext = createContext<GraphContextValue | null>(null);

const EMPTY_FILTER: GraphFilter = {};

export function GraphProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<GraphStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [rawGraph, setRawGraph] = useState<ListeningGraph | null>(null);
    const [filter, setFilterState] = useState<GraphFilter>(EMPTY_FILTER);
    const fetchedRef = useRef(false);

    const loadGraph = useCallback(async (forceRefresh = false) => {
        setStatus("loading");
        setError(null);
        try {
            const data = await fetchGraph(forceRefresh);
            setRawGraph(data);
            setStatus("ready");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load graph";
            setError(message);
            setStatus("error");
        }
    }, []);

    // Fetch on mount (once)
    useEffect(() => {
        if (!fetchedRef.current) {
            fetchedRef.current = true;
            loadGraph();
        }
    }, [loadGraph]);

    // Build the graphology instance from filtered data
    const { graph, filteredNodes } = useMemo(() => {
        if (!rawGraph) return { graph: null, filteredNodes: 0 };

        const hasFilter =
            filter.minPlays !== undefined ||
            (filter.sources?.length ?? 0) > 0 ||
            (filter.clusterIds?.length ?? 0) > 0;

        const data = hasFilter ? filterGraph(rawGraph, filter) : rawGraph;
        return {
            graph: toGraphology(data),
            filteredNodes: Object.keys(data.nodes).length,
        };
    }, [rawGraph, filter]);

    const totalNodes = rawGraph ? Object.keys(rawGraph.nodes).length : 0;

    const setFilter = useCallback((newFilter: GraphFilter) => {
        setFilterState((prev) => ({ ...prev, ...newFilter }));
    }, []);

    const clearFilter = useCallback(() => {
        setFilterState(EMPTY_FILTER);
    }, []);

    const refresh = useCallback(() => {
        clearGraphCache();
        loadGraph(true);
    }, [loadGraph]);

    const value = useMemo<GraphContextValue>(
        () => ({
            status,
            error,
            graph,
            metadata: rawGraph?.metadata ?? null,
            totalNodes,
            filteredNodes,
            filter,
            setFilter,
            clearFilter,
            refresh,
        }),
        [status, error, graph, rawGraph, totalNodes, filteredNodes, filter, setFilter, clearFilter, refresh],
    );

    return <GraphContext value={value}>{children}</GraphContext>;
}

export function useGraph(): GraphContextValue {
    const ctx = useContext(GraphContext);
    if (!ctx) {
        throw new Error("useGraph must be used within a GraphProvider");
    }
    return ctx;
}
