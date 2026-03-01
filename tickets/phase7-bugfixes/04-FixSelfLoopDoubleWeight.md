# 04 — Fix Self-Loop Double Weight in Cluster Adjacency

## Summary

When building undirected adjacency from directed edges, if a node has a self-loop (`i === j`), both `weights[i][j]` and `weights[j][i]` increment the same cell, resulting in `2*w` instead of `w`. This inflates the self-loop node's degree and creates an inconsistency between degree sums and `m`.

## Owner

Dev

## Dependencies

- None

## Source

- BugBot comment on PR #63: "Self-loop edges get double weight in cluster adjacency"

## Implementation Steps

- [ ] In `clusters.ts` line ~64-65, skip the reverse assignment when `i === j` to avoid double-counting self-loops.
- [ ] Add a test with a self-loop edge verifying correct weight.

## Exit Criteria

- [ ] Self-loop edges are counted once, not twice.
- [ ] All existing tests pass.
