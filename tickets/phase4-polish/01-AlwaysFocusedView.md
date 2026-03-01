# 01 — Always-Focused Node View

**Owner:** Dev
**Status:** Done

## Summary

Replace the default "all nodes visible" graph view with a permanently focused single-node view. The graph always has exactly one node selected, showing only its neighbors and connections in the contrast highlight style.

## Acceptance Criteria

- [X] Auto-select a random node on graph load
- [X] Remove ForceAtlas2 live animation (no shaking on load)
- [X] Remove all deselect paths: no clickStage deselect, no Escape key deselect, no close button on detail panel
- [X] A node is always focused — clicking another node switches focus
- [X] The "unfocused" state (all nodes colorful, all edges visible) is never reachable

## Motivation

The contrast focused view (one node highlighted, neighbors visible, everything else dimmed) is the preferred visual style. The unfocused rainbow view with all edges was noisy and unpleasant.
