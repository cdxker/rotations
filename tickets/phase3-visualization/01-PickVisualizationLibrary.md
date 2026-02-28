# 01 — Pick Visualization Library

## Summary

Research and select a graph visualization library that integrates with the existing React/Astro stack.

## Owner

Dev

## Dependencies

- Phase 2 `02-EnrichedExport.md` (need to know the data shape, though research can start earlier)

## Parallelizable With

- `01-DesignGraphUI.md`

## Context

The existing `site/` app uses:
- **Astro 5** + **React 19** + **TypeScript**
- **TailwindCSS 4** with oklch color variables
- **Radix UI** primitives (slider, slot)
- **shadcn/ui** components (button variants, etc.)
- **lucide-react** icons
- **TinyBase** for client-side state

The visualization library must integrate cleanly with this stack.

## Acceptance Criteria

- [ ] Evaluate at minimum:
  - **D3.js** (force-directed layout) — most flexible, steepest learning curve, great for custom layouts
  - **Cytoscape.js** — purpose-built for graph/network viz, supports layouts out of the box
  - **Sigma.js** — WebGL-based, handles large graphs well, React bindings available
  - **react-force-graph** — React wrapper around d3-force, easy to integrate
- [ ] Criteria to evaluate:
  - React integration (hooks, components, or imperative API?)
  - Performance with 10k-100k nodes
  - Built-in interactivity (zoom, pan, click, hover)
  - Layout algorithms (force-directed, hierarchical, circular)
  - Customization (node sizing by PageRank, edge thickness by weight, color by cluster)
  - Bundle size
- [ ] Decision document with recommendation

## Notes

- Performance matters — the graph could have 100k+ nodes. Consider whether we need WebGL rendering.
- The library should support the interactive features planned in `03-InteractiveFeatures.md` and `04-PathExploration.md`.
