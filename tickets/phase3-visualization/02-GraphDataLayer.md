# 02 — Graph Data Layer

## Summary

Connect the enriched graph data from Phase 2 to the frontend. Fetch from the Phase 1 server API and make it available to React components.

## Owner

Dev

## Dependencies

- `01-PickVisualizationLibrary.md` (need to know what data format the viz library expects)
- Phase 1 `05-CreateServer.md` (need the API to fetch from)
- Phase 2 `02-EnrichedExport.md` (need enriched data available)

## Parallelizable With

- `02-BasicGraphRendering.md` (can develop in parallel with mock data)

## Acceptance Criteria

- [X] Fetch enriched graph from the server API
- [X] Transform graph data into the format the chosen viz library needs
- [X] State management: extend TinyBase store or create a new React context for graph state
- [X] Handle loading states, errors, and empty graphs
- [X] Support filtering on the data layer (by source, min play count, cluster) before passing to the viz
- [X] Caching: avoid re-fetching on every page visit

## Notes

- If the graph is very large, consider fetching a subset (e.g. top N nodes by PageRank) and loading more on demand.
- The existing `site/` app uses TinyBase for state — evaluate whether it makes sense to store graph data there too, or if a simpler React context is sufficient for read-only visualization data.

## Progress

- [X] Created `site/src/lib/graph-types.ts` — frontend types mirroring the graph-pipeline API types (SongKey, GraphNode, ListeningGraph, GraphFilter)
- [X] Created `site/src/lib/graph-api.ts` — fetch with in-memory cache, filterGraph, toGraphology transform, cluster color palette
- [X] Created `site/src/hooks/GraphContext.tsx` — React context with loading/error/ready states, filtering support, refresh, memoized graphology instance
- [X] Updated `site/src/components/graph/useGraphData.ts` — refactored to use shared data layer, preserved mock fallback for dev
- [X] Installed Sigma.js + graphology dependencies (sigma, graphology, @react-sigma/core, @react-sigma/layout-forceatlas2, etc.)
- [X] Fixed vitest alias path in vitest.config.ts
- [X] 19 tests covering: filterGraph (6), toGraphology (8), getClusterColor (2), fetchGraph (3)

### Architecture Decisions
- **React context over TinyBase**: Graph data is read-only visualization data; a React context with `useMemo` is simpler and avoids serialization overhead. TinyBase is better suited for the music player's mutable local state.
- **In-memory cache**: Simple module-level cache avoids re-fetching on navigation. `refresh()` clears cache for manual reload.
- **Two layers**: `useGraphData` hook (used by GraphView) wraps the lower-level `graph-api.ts` functions. `GraphContext` provides the same data with filtering support for future components (search, filter panel, cluster view).
- **Attribute alignment**: Node size uses log-scale play count, colors from cluster ID palette, random x/y for ForceAtlas2 initial positions — matching the rendering agent's style.
