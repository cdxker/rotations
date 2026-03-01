# 04 — Optimize Depth-Layers Edge Iteration

## Summary

`computeDepthLayers` calls `graph.forEachEdge` over the *entire* graph to find edges between depth-neighborhood nodes. For large graphs this is O(E) on every node click. Since edges between neighborhood nodes can be found by iterating only the edges of nodes already in the neighborhood, this is unnecessarily expensive.

## Owner

Dev

## Dependencies

- None

## Source

- BugBot comment on PR #63: "Depth-layers iterates all graph edges inefficiently"

## Implementation Steps

- [ ] Replace the full-graph `forEachEdge` at line ~70 with per-node edge iteration over only the nodes in the depth neighborhood.
- [ ] Verify depth-layers tests still pass.

## Exit Criteria

- [ ] Edge collection only iterates edges of nodes in the neighborhood, not the entire graph.
- [ ] All existing tests pass.
