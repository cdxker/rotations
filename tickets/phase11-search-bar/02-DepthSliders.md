# Next/Previous Depth Sliders

**Owner:** Dev
**Phase:** search-bar
**Depends on:** `00-HighlightNodeOnSearchSelect.md`

## Problem

When a node is selected, the graph shows all nodes regardless of how many hops away they are. There is no way to control how many forward (next) or backward (previous) song transitions are shown from the selected node.

## Goal

Add two sliders next to the `SearchBar` in the top-left corner — one for "next" depth and one for "previous" depth. When a node is selected, only nodes within the specified number of hops are shown.

## Implementation Notes

- Create a single self-contained component (`DepthSliders.tsx`) with no props. It reads everything it needs from `useGraph()` (specifically `graph`, `selectedNode`).
- All state (slider values, computed visible node sets) lives inside the component.
- The sliders are only active/visible when `selectedNode` is non-null. When no node is selected, hide or disable them.
- "Next depth" controls how many hops to follow via outgoing edges from the selected node. "Previous depth" controls incoming edges.
- Walk the graph BFS from `selectedNode` up to the chosen depth in each direction to compute the set of visible node IDs.
- Use Sigma's node/edge reducers (via `useSigma()`) to hide nodes not in the visible set and edges where either endpoint is hidden.
- Reasonable default range: 1–5 hops, default value of 2.
- Place next to the `SearchBar` in the top-left toolbar area.
- Match the SearchBar's styling: `bg-neutral-900/95 border border-white/10 rounded-full` with white/monospace text.

## Acceptance Criteria

- [ ] Two sliders appear next to the SearchBar when a node is selected.
- [ ] The "next" slider controls how many forward hops of songs are shown.
- [ ] The "previous" slider controls how many backward hops of songs are shown.
- [ ] Nodes outside the depth range are hidden; edges to/from hidden nodes are hidden.
- [ ] Sliders are hidden or disabled when no node is selected.
- [ ] Changing slider values updates the visible graph in real time.
- [ ] Styling matches the SearchBar's dark pill aesthetic.
