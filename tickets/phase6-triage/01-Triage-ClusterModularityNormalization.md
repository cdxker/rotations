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

## Notes

- Triage only. No production fix in this ticket.
