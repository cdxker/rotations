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

- [ ] Fetch enriched graph from the server API
- [ ] Transform graph data into the format the chosen viz library needs
- [ ] State management: extend TinyBase store or create a new React context for graph state
- [ ] Handle loading states, errors, and empty graphs
- [ ] Support filtering on the data layer (by source, min play count, cluster) before passing to the viz
- [ ] Caching: avoid re-fetching on every page visit

## Notes

- If the graph is very large, consider fetching a subset (e.g. top N nodes by PageRank) and loading more on demand.
- The existing `site/` app uses TinyBase for state — evaluate whether it makes sense to store graph data there too, or if a simpler React context is sufficient for read-only visualization data.
