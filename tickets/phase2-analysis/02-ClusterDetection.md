# 02 — Cluster Detection

## Summary

Identify clusters of tightly connected tracks — songs you tend to listen to together.

## Owner

Dev

## Dependencies

- `01-PageRank.md` or `01-BasicStats.md` (need the graph with basic analysis done)

## Parallelizable With

- `02-EnrichedExport.md`

## Acceptance Criteria

- [X] Implement a community detection algorithm. Options:
  - **Connected components** — simplest, finds isolated subgraphs
  - **Louvain method** — finds communities by optimizing modularity, good for weighted graphs *(chosen)*
  - **Label propagation** — simpler alternative to Louvain
- [X] Assign a `clusterId` to each `GraphNode`
- [X] Compute per-cluster stats: size, top songs within cluster, inter-cluster edge count
- [X] Output: graph with cluster IDs populated

## Notes

- Start simple (connected components), upgrade to Louvain if the results are too coarse.
- Clusters likely correspond to albums, playlists, or "listening moods" — interesting to surface in the visualization.

## Progress

- [X] Added `clusterId?: number` to `GraphNode` in `src/graph/types.ts`
- [X] Implemented Louvain method in `src/analysis/clusters.ts`
- [X] `detectClusters(graph)` — mutates graph, sets clusterId on each node
- [X] Returns `ClusterResult`: clusterCount, per-cluster stats, modularity score
- [X] Per-cluster stats: size, top songs (by totalPlays), inter-cluster edge count
- [X] 11 tests covering all acceptance criteria

### Notes
- Went directly to Louvain (skipped connected components) since weighted modularity optimization gives meaningful clusters
- Edges treated as undirected for community detection (sum of next + previous weights)
- Contiguous cluster IDs starting from 0
- Modularity score returned for quality assessment
