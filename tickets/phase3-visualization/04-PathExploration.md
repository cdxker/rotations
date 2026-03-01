# 04 — Path Exploration

## Summary

Enable exploring transition paths between two songs in the graph.

## Owner

Dev

## Dependencies

- `03-InteractiveFeatures.md`
- `02-GraphDataLayer.md`

## Parallelizable With

- `04-SearchAndFilter.md`

## Acceptance Criteria

- [ ] **Two-node selection**: UI to pick a start song and end song (via click or search)
- [ ] **Shortest path**: compute and highlight the shortest path (fewest hops) between the two songs
- [ ] **Strongest path**: compute and highlight the path with the highest minimum edge weight (the "most likely" listening path)
- [ ] **Path display**: highlight the path nodes and edges, dim everything else. Show the path as an ordered list in the sidebar with edge weights.
- [ ] **Path stats**: total hops, total weight along the path, intermediate songs
- [ ] Handle case where no path exists (disconnected components)

## Notes

- Shortest path = BFS on the unweighted graph. Strongest path = modified Dijkstra maximizing minimum edge weight.
- This feature answers the question: "How does my listening get from Song A to Song B?"
- Could be a fun discovery tool — find unexpected connections between songs from different genres.
