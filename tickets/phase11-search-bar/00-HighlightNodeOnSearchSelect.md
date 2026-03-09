# Highlight Node on Search Select

**Owner:** Dev
**Phase:** search-bar
**Depends on:** —

## Problem

When a user selects a search result in the graph-frontend `SearchBar` (native `<datalist>` autocomplete), the matching node key is only logged to `console.log` — no visual change occurs in the graph.

## Goal

Selecting a search result should visually highlight that node in the graph, using the same neighbor-dimming behavior that already exists when clicking a node directly on the canvas (see `Graph.tsx` `selectedNode` / `selectedNeighbors` logic).

## Implementation Notes

- The `selectedNode` state currently lives locally in `Graph.tsx` (line 10, inside the `SigmaContainer`), but `SearchBar` lives outside the `SigmaContainer` in `MusicGraph.tsx`.
- Lift `selectedNode` and `setSelectedNode` into `graphContext.tsx` so both `Graph.tsx` and `SearchBar.tsx` can share it.
- Update `Graph.tsx` to read `selectedNode` / `setSelectedNode` from context instead of local `useState`.
- Keep the `selectedNeighbors` derivation in `Graph.tsx` (it depends on the graphology instance which is available there).
- Update `SearchBar.tsx` `handleChange` to call `setSelectedNode(nodeKey)` instead of `console.log`.

## Acceptance Criteria

- [ ] Selecting a search result highlights the node and dims non-neighbors, identical to clicking the node on the canvas.
- [ ] Clicking the canvas (stage) still clears the selection.
- [ ] No regressions to existing click-to-select behavior.
