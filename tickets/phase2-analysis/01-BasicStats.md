# 01 — Basic Stats

## Summary

Compute summary statistics over the listening graph.

## Owner

Dev

## Dependencies

- Phase 1 complete (need a constructed `ListeningGraph`)

## Parallelizable With

- `01-PageRank.md`

## Acceptance Criteria

- [ ] Compute per-node stats:
  - In-degree (number of unique songs that transition TO this song)
  - Out-degree (number of unique songs this song transitions TO)
  - Weighted in-degree (sum of incoming edge weights)
  - Weighted out-degree (sum of outgoing edge weights)
- [ ] Compute graph-level stats:
  - Total nodes (unique songs)
  - Total edges (unique transitions)
  - Total scrobbles / plays
  - Date range of listening history
  - Per-source breakdown (how many scrobbles from Last.fm vs Spotify)
  - Average / median degree
- [ ] Compute rankings:
  - Top N most played songs
  - Top N most connected songs (highest total degree)
  - Top N highest in-degree (most "arrived at" songs)
  - Top N highest out-degree (most "departed from" songs)
- [ ] Output: stats object attached to the graph or exported separately

## Notes

- These stats are useful both for Phase 3 visualization (display in a sidebar/panel) and for sanity-checking the graph.

## Progress

- [X] Per-node stats: inDegree, outDegree, weightedInDegree, weightedOutDegree, totalDegree
- [X] Graph-level stats: totalNodes, totalEdges, totalScrobbles, dateRange, sourceBreakdown, averageDegree, medianDegree
- [X] Rankings: mostPlayed, mostConnected, highestInDegree, highestOutDegree (configurable topN)
- [X] Output as `StatsResult` with `graphStats`, `rankings`, and `nodeStats` Map
- [X] 7 tests covering all stats, rankings, edge cases (empty graph), topN parameter
