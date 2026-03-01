# 02 — Enriched Export

## Summary

Export the fully analyzed graph — with PageRank scores, stats, and cluster IDs — as the final artifact that Phase 3 visualization consumes.

## Owner

Dev

## Dependencies

- `01-PageRank.md`
- `01-BasicStats.md`
- `02-ClusterDetection.md`

## Parallelizable With

None — this is the final step of Phase 2.

## Acceptance Criteria

- [ ] Combine all analysis results into a single enriched `ListeningGraph`:
  - Each `GraphNode` has: `pageRank`, `clusterId`, `inDegree`, `outDegree`
  - Graph-level metadata includes: summary stats, cluster summaries, top-N rankings
- [ ] Export as JSON file
- [ ] Persist to database (update existing records from Phase 1)
- [ ] Serve via the Phase 1 server API (add/update endpoints as needed)
- [ ] Document the enriched schema so Phase 3 knows exactly what data is available

## Notes

- This is the handoff point between analysis and visualization. The enriched export should contain everything the frontend needs without additional computation.

## Progress

- [X] `enrichGraph(graph)` runs PageRank + clusters + stats, attaches results to nodes
- [X] `exportEnrichedGraph(result, path)` writes enriched graph + analysis summary as JSON
- [X] DB schema updated: `page_rank REAL`, `cluster_id INTEGER` columns on `nodes` table
- [X] DB save/load/getNode round-trips `pageRank` and `clusterId`
- [X] New `GET /graph/analysis` endpoint returns full analysis summary (stats, rankings, PageRank top songs, cluster summaries)
- [X] Existing `/graph` and `/graph/node/:key` endpoints automatically include `pageRank`/`clusterId` via DB layer
- [X] 5 tests for enrich module + all 114 project tests pass

## Enriched Schema (for Phase 3)

### Per-node fields (on each `GraphNode`):
- `pageRank: number` — PageRank score (sum to 1.0 across all nodes)
- `clusterId: number` — Community cluster ID (contiguous integers starting at 0)
- `totalPlays`, `sources`, `next`, `previous` — from Phase 1

### `GET /graph/analysis` response:
```json
{
  "pageRank": { "iterations", "converged", "maxDelta", "topSongs": [...] },
  "stats": { "totalNodes", "totalEdges", "totalScrobbles", "dateRange", "sourceBreakdown", "averageDegree", "medianDegree" },
  "rankings": { "mostPlayed", "mostConnected", "highestInDegree", "highestOutDegree" },
  "clusters": { "clusterCount", "modularity", "clusters": [{ "clusterId", "size", "topSongs", "interClusterEdges" }] }
}
```

### JSON file export:
`{ "graph": ListeningGraph, "analysis": AnalysisSummary }` — contains everything above in one file.
