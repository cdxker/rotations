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
