# 01 — Fix Modularity Normalization Factor

## Summary

Correct `computeModularity` to divide by `2m` instead of `m`, producing the standard modularity score. Clustering assignments are unaffected; only the reported score changes.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` tickets in this phase

## Source

- Triage: `phase6-triage/01-Triage-ClusterModularityNormalization.md` (Schedule)
- BugBot comment: `discussion_r2867935705`

## Implementation Steps

- [ ] In `clusters.ts`, change `computeModularity` to use `q += w - (degree[i] * degree[j]) / (2 * m)` and `return q / (2 * m)`.
- [ ] Update test assertions in `clusters.test.ts` to expect the corrected (halved) modularity values.
- [ ] Verify clustering assignments remain identical (they should — Louvain uses relative delta-Q).

## Exit Criteria

- [ ] Reported modularity score matches the standard formula `Q = (1/2m) * sum[(Aij - ki*kj/2m) * delta(ci,cj)]`.
- [ ] All existing tests pass with updated assertions.
