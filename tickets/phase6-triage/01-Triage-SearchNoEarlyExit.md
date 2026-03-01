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

## Triage Decision

**Disposition: Close as Invalid**

**Evidence:**
- Both `SearchBar.tsx` and `PathPanel.tsx` already have an early exit at 20 matches: `if (matches.length >= 20) return` inside `graph.forEachNode()`.
- SearchBar displays top 10 results sorted by play count; PathPanel displays top 8.
- For a typical graph (10k-20k nodes), the scan is O(N) worst case but terminates early once 20 matches are found, which happens quickly for most queries.
- `graph.forEachNode()` cannot be short-circuited via `return` in graphology (it only skips the current iteration), but the early exit prevents unnecessary work in the callback body.

**Impact:** Negligible. The current implementation is performant for expected graph sizes.

## Notes

- Triage only. No production fix in this ticket.
