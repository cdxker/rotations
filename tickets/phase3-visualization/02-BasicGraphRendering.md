# 02 — Basic Graph Rendering

## Summary

Render the listening graph with nodes and edges using the chosen visualization library.

## Owner

Dev

## Dependencies

- `01-PickVisualizationLibrary.md`
- `01-DesignGraphUI.md`
- `02-GraphDataLayer.md` (or mock data for initial development)

## Parallelizable With

- `02-GraphDataLayer.md` (can develop with mock data)

## Acceptance Criteria

- [ ] Render nodes as circles/dots:
  - Size scaled by PageRank score
  - Color by cluster ID (using `chart-1` through `chart-5` CSS variables)
- [ ] Render edges as lines:
  - Thickness scaled by edge weight (transition count)
  - Opacity or color to indicate direction
- [ ] Force-directed layout that stabilizes into readable clusters
- [ ] Basic performance: should handle at least 1,000 nodes smoothly. Degrade gracefully for larger graphs (reduce detail, aggregate, or paginate).
- [ ] Integrate into the existing `site/` Astro app as a new page (e.g. `/graph`)
- [ ] Match the existing dark theme (`#0B0B0B` background, oklch colors)

## Notes

- Start with a subset of the graph (e.g. top 500 nodes by PageRank) to get rendering working, then optimize for larger graphs.
- The force-directed layout may need tuning (gravity, charge, link distance) to produce readable results with music data.

## Progress

- [X] Install sigma, graphology, @react-sigma packages
- [X] Create /graph Astro page (client:only="react")
- [X] Build GraphView component with SigmaContainer + GraphLoader
- [X] Node sizing by play count (log scale 4-20px), colors by cluster (5-color palette)
- [X] Edge rendering with log-scaled thickness, weight-based opacity (5-30%)
- [X] Force-directed layout (ForceAtlas2 Web Worker, 5s auto-stop)
- [X] Dark theme (#0B0B0B bg, DM Mono labels, white/80 label color)
- [X] Mock data fallback when API unavailable
- [X] Verify compilation (tsc --noEmit clean for new files)
