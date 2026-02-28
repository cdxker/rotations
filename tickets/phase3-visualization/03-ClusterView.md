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

- [ ] Color-code nodes by cluster ID using existing chart color variables (`chart-1` through `chart-5`, cycling for additional clusters)
- [ ] Legend showing cluster colors with cluster summary (size, top songs)
- [ ] Toggle cluster visibility — show/hide individual clusters
- [ ] "Focus cluster" mode — click a cluster in the legend to zoom in and isolate that cluster
- [ ] Show inter-cluster edges differently (thinner, dashed, or different color) vs intra-cluster edges
- [ ] Cluster labels (if clusters can be meaningfully named — e.g. by most common artist or album)

## Notes

- With 5 chart color variables, clusters beyond 5 will need generated colors or a cycling scheme.
- Clusters likely correspond to albums, genres, or "listening sessions" — surfacing this in labels would be valuable.
