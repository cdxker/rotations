# 01 — TRIAGE: GraphView Builds Graph Data Twice

## Summary

Assess whether duplicate `useGraphData()` usage is causing unnecessary duplicate graph construction and overhead.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867742367`

## Triage Steps

- [ ] Verify duplicate hook invocation and resulting graph instances.
- [ ] Quantify overhead and potential behavioral mismatch.
- [ ] Decide if it is bug, optimization, or acceptable tradeoff.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Notes

- Triage only. No production fix in this ticket.
