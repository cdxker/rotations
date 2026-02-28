# 03 — Interactive Features

## Summary

Add interactivity to the graph visualization — zoom, pan, click, hover, and node detail display.

## Owner

Dev

## Dependencies

- `02-BasicGraphRendering.md`

## Parallelizable With

- `03-ClusterView.md`

## Context

The existing `site/` app has interactive patterns to draw from:
- `PlayerView.tsx` handles track selection with click handlers and state updates
- Radix UI slider for continuous controls
- Tailwind transitions and hover states

## Acceptance Criteria

- [ ] **Zoom and pan**: mouse wheel zoom, click-drag to pan
- [ ] **Hover**: tooltip showing song name, artist(s), play count, PageRank score
- [ ] **Click to select**: clicking a node opens a detail panel/sidebar with:
  - Song name, artists, album
  - PageRank score and rank position
  - Total plays, source breakdown
  - List of top incoming/outgoing connections (neighbors)
- [ ] **Highlight neighbors**: when a node is selected, highlight its immediate neighbors and dim everything else
- [ ] **Edge hover**: show transition count between two songs
- [ ] **Deselect**: click empty space or press Escape to clear selection

## Notes

- Reuse the sidebar pattern from `PlayerView.tsx` for the node detail panel.
- Consider keyboard navigation (arrow keys to move between neighbors).
