# 01 — Design Graph UI

## Summary

Design the graph visualization UI layout. Reuse existing patterns from the `site/` app.

## Owner

Dev

## Dependencies

None — can start from existing UI patterns.

## Parallelizable With

- `01-PickVisualizationLibrary.md`

## Context — Existing UI Patterns to Reuse

The `site/` app already has:
- **Multi-mode views**: `PlayerView.tsx` switches between player/playlists/spotify-add modes — similar pattern for graph/stats/search views
- **Sidebar pattern**: next-tracks sidebar in PlayerView — reusable for node details
- **Tailwind theme**: oklch color variables, `#0B0B0B` dark background, DM Mono font
- **shadcn/ui components**: buttons (multiple variants/sizes), could add more (card, dialog, input, tabs)
- **Radix UI slider**: reusable for filter controls (min play count, edge weight threshold)
- **lucide-react icons**: already available for navigation, controls

## Acceptance Criteria

- [ ] Wireframe / mockup of the graph view page
- [ ] Define the view structure:
  - Main area: graph canvas (force-directed layout)
  - Sidebar/panel: node details on click (song name, artists, PageRank, play count, neighbors)
  - Top bar or controls: search, filters, view toggles
  - Stats panel: summary statistics from Phase 2
- [ ] Define how this integrates with the existing `site/` app:
  - New Astro page (e.g. `/graph`)?
  - New view mode in the existing player?
  - Separate standalone page?
- [ ] Color scheme for clusters (use existing `chart-1` through `chart-5` CSS variables)
- [ ] Responsive considerations (does this need to work on mobile?)

## Notes

- Keep the design consistent with the existing app's aesthetic — dark theme, monospace font, clean/minimal.
- The graph view is likely its own page (`/graph`) rather than part of the player.
