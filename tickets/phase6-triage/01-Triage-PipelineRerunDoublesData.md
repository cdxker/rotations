# 01 — TRIAGE: Pipeline Rerun Doubles Data

## Summary

Assess whether rerunning `/pipeline/build` or `/pipeline/run` incorrectly doubles graph counts.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867888536`

## Triage Steps

- [ ] Reproduce behavior on current branch with repeat runs.
- [ ] Confirm root cause with file/line references.
- [ ] Measure impact on node counts, edge weights, and totals.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Notes

- Triage only. No production fix in this ticket.
