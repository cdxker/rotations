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

- [X] **Zoom and pan**: mouse wheel zoom, click-drag to pan
- [X] **Hover**: tooltip showing song name, artist(s), play count, PageRank score
- [X] **Click to select**: clicking a node opens a detail panel/sidebar with:
  - Song name, artists, album
  - PageRank score and rank position
  - Total plays, source breakdown
  - List of top incoming/outgoing connections (neighbors)
- [X] **Highlight neighbors**: when a node is selected, highlight its immediate neighbors and dim everything else
- [X] **Edge hover**: show transition count between two songs
- [X] **Deselect**: click empty space or press Escape to clear selection

## Notes

- Reuse the sidebar pattern from `PlayerView.tsx` for the node detail panel.
- Consider keyboard navigation (arrow keys to move between neighbors).

## Progress

- [X] `GraphEvents.tsx` — Sigma event handler component using `useRegisterEvents`
  - `clickNode` → select node, build neighbor list, trigger detail panel
  - `clickStage` → deselect
  - `enterNode`/`leaveNode` → hover tooltip
  - `enterEdge`/`leaveEdge` → edge tooltip
  - Escape key → deselect
  - `nodeReducer`/`edgeReducer` for neighbor highlighting (dims non-neighbors, hides non-connected edges)
- [X] `GraphTooltip.tsx` — NodeTooltip (song, artist, plays, PageRank) + EdgeTooltip (transition count)
- [X] `NodeDetailPanel.tsx` — Right sidebar with:
  - Header: track name, artists
  - Stats grid: plays, PageRank, cluster (with color dot), sources, album
  - "Played after" (outgoing neighbors) and "Played before" (incoming neighbors) lists
  - Click neighbor → camera animates to node, selects it
  - Close button + Escape key
- [X] `GraphNavigator` — Sigma camera animation to navigate between nodes from the detail panel
- [X] Updated `GraphView.tsx` — wired all components together, overlays rendered outside SigmaContainer

### Architecture
- Event handling and reducers live inside SigmaContainer (need `useSigma`)
- Tooltips and detail panel rendered outside SigmaContainer for proper absolute positioning
- Hover state is suppressed when a node is selected (tooltip hidden, only panel shows)
- Highlighting applies to both hover and selection (selected takes priority)
