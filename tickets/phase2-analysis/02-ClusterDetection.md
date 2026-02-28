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

- [ ] Implement a community detection algorithm. Options:
  - **Connected components** — simplest, finds isolated subgraphs
  - **Louvain method** — finds communities by optimizing modularity, good for weighted graphs
  - **Label propagation** — simpler alternative to Louvain
- [ ] Assign a `clusterId` to each `GraphNode`
- [ ] Compute per-cluster stats: size, top songs within cluster, inter-cluster edge count
- [ ] Output: graph with cluster IDs populated

## Notes

- Start simple (connected components), upgrade to Louvain if the results are too coarse.
- Clusters likely correspond to albums, playlists, or "listening moods" — interesting to surface in the visualization.
