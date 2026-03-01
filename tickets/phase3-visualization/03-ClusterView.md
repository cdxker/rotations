# 03 — Cluster View

## Summary

Visualize clusters (communities of related tracks) with color coding and toggle controls.

## Owner

Dev

## Dependencies

- `02-BasicGraphRendering.md`
- Phase 2 `02-ClusterDetection.md` (need cluster IDs on nodes)

## Parallelizable With

- `03-InteractiveFeatures.md`

## Acceptance Criteria

- [X] Color-code nodes by cluster ID using existing chart color variables (`chart-1` through `chart-5`, cycling for additional clusters)
- [X] Legend showing cluster colors with cluster summary (size, top songs)
- [X] Toggle cluster visibility — show/hide individual clusters
- [X] "Focus cluster" mode — click a cluster in the legend to zoom in and isolate that cluster
- [X] Show inter-cluster edges differently (thinner, dashed, or different color) vs intra-cluster edges
- [X] Cluster labels (if clusters can be meaningfully named — e.g. by most common artist or album)

## Notes

- With 5 chart color variables, clusters beyond 5 will need generated colors or a cycling scheme.
- Clusters likely correspond to albums, genres, or "listening sessions" — surfacing this in labels would be valuable.

## Progress

- [X] Created `useClusterInfo` hook to extract cluster summaries from graphology graph
- [X] Created `ClusterLegend` component with toggle visibility (eye icon) and focus mode (focus icon)
- [X] Composed cluster-based nodeReducer/edgeReducer with existing hover/select highlighting in GraphEvents
- [X] Inter-cluster edges styled thinner (0.3-1.5px) and more transparent (2-10%) vs intra-cluster edges
- [X] Focus mode isolates cluster, hides inter-cluster edges, dims non-focused nodes
- [X] Toggle mode hides cluster nodes and connected edges entirely
- [X] Cluster labels derived from most common artist; top 3 songs shown in legend
- [X] Mock data updated with artists array and inter/intra cluster edge styling
- [X] TypeScript clean (no new errors), all 27 tests pass
