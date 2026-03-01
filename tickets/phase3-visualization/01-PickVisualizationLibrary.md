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

- [X] Evaluate at minimum:
  - **D3.js** (force-directed layout) — most flexible, steepest learning curve, great for custom layouts
  - **Cytoscape.js** — purpose-built for graph/network viz, supports layouts out of the box
  - **Sigma.js** — WebGL-based, handles large graphs well, React bindings available
  - **react-force-graph** — React wrapper around d3-force, easy to integrate
- [X] Criteria to evaluate:
  - React integration (hooks, components, or imperative API?)
  - Performance with 10k-100k nodes
  - Built-in interactivity (zoom, pan, click, hover)
  - Layout algorithms (force-directed, hierarchical, circular)
  - Customization (node sizing by PageRank, edge thickness by weight, color by cluster)
  - Bundle size
- [X] Decision document with recommendation

## Notes

- Performance matters — the graph could have 100k+ nodes. Consider whether we need WebGL rendering.
- The library should support the interactive features planned in `03-InteractiveFeatures.md` and `04-PathExploration.md`.

## Progress

- [X] Evaluated all four candidates across React integration, performance, interactivity, layouts, customization, bundle size
- [X] Decision document: `graph-pipeline/docs/visualization-library-decision.md`
- [X] **Recommendation: Sigma.js + graphology (via @react-sigma)**

### Decision Summary
- **Sigma.js** chosen for WebGL-native rendering (only library handling 50k+ nodes)
- `@react-sigma` v5 provides modern hook-based React 19 integration (actively maintained)
- graphology ecosystem includes ForceAtlas2 (Web Worker), shortest-path (for ticket 04), and community detection
- Reducer pattern natively supports neighbor highlighting and path highlighting (tickets 03/04)
- All libraries require `client:only="react"` in Astro — not a differentiator
- Trade-offs: fewer layout algorithms than Cytoscape (acceptable — we only need force-directed), smaller community than D3
