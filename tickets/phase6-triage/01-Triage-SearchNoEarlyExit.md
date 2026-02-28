# 01 — TRIAGE: Search Iteration Does Not Early Exit

## Summary

Assess whether current search implementations scan full graphs unnecessarily on each keystroke.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comments: `discussion_r2867742356`, `discussion_r2867742366`

## Triage Steps

- [ ] Profile/inspect search execution paths in `SearchBar` and `PathPanel`.
- [ ] Confirm inability to short-circuit current iteration approach.
- [ ] Estimate impact at expected graph sizes.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Notes

- Triage only. No production fix in this ticket.
