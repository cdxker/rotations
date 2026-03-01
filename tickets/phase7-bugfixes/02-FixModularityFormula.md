# 02 — Fix Modularity Formula (Non-Adjacent Pairs)

## Summary

`computeModularity` in `clusters.ts` only sums over connected same-community pairs, omitting the `−k_i·k_j/(2m)` penalty for non-adjacent same-community pairs. This systematically overestimates modularity. Replace with the equivalent per-community formula: `Q = Σ_c [L_c/m − (d_c/(2m))²]` which computes the same result without iterating all pairs.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `02-*` tickets in this phase

## Source

- BugBot comment on PR #63 (2026-03-01): "Modularity computation misses unconnected same-community pairs"
- Note: Phase 7 `01-FixModularityNormalization` fixed the `m` vs `2m` normalization. This is a separate issue — the formula itself is incomplete.

## Implementation Steps

- [ ] Rewrite `computeModularity` (lines 211–227) to use per-community aggregation:
  - For each community `c`, compute `L_c` (sum of edge weights within `c`) and `d_c` (sum of degrees in `c`).
  - `Q = Σ_c [L_c/m − (d_c/(2m))²]`
- [ ] Update the test in `clusters.test.ts` to assert specific expected modularity values for the well-separated cluster case (currently only checks `> 0`).
- [ ] Add a test for a two-node, one-community graph where correct modularity is 0 (the old formula returned 0.5).

## Exit Criteria

- [ ] `computeModularity` returns correct values per the standard formula.
- [ ] Tests assert exact expected values (within float tolerance).
- [ ] All existing tests pass.
