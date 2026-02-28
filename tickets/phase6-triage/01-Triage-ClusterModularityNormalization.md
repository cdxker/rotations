# 01 — TRIAGE: Cluster Modularity Normalization

## Summary

Assess whether `computeModularity` uses the correct normalization factor and whether the reported modularity score should be corrected.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867935705`

## Triage Steps

- [ ] Verify current modularity formula against the intended graph model.
- [ ] Confirm whether clustering assignments are affected or only the reported score.
- [ ] Quantify impact on outputs/docs/tests.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Schedule**

**Evidence:**
- The standard modularity formula is `Q = (1/2m) * sum[(Aij - ki*kj/2m) * delta(ci,cj)]`.
- The implementation in `computeModularity()` divides by `m` instead of `2m`, and uses `ki*kj/m` instead of `ki*kj/2m`.
- This results in a modularity score that is approximately 2x the correct value.
- **Clustering assignments are NOT affected** — the Louvain algorithm makes relative comparisons (delta Q) where the constant factor cancels out.
- Only the **reported modularity score** is incorrect, affecting display values, test assertions, and any comparison with reference modularity benchmarks.

**Impact:** Low — cosmetic error in the reported score. Clustering quality is unaffected. Tests would need updated assertions if the normalization is corrected.

**Recommendation:** Schedule a fix to divide by `2*m` and update affected test expectations.

## Notes

- Triage only. No production fix in this ticket.
