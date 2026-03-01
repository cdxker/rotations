# 01 — TRIAGE: `sourceBreakdown` Semantics Mismatch

## Summary

Assess whether `sourceBreakdown` is incorrectly counting nodes instead of plays/scrobbles versus product expectations.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867742364`

## Triage Steps

- [ ] Compare current implementation with spec and ticket language.
- [ ] Confirm expected definition with product/documentation.
- [ ] Evaluate data model implications of changing semantics.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Schedule**

**Evidence:**
- The spec (`01-BasicStats.md` line 31) says "how many scrobbles from Last.fm vs Spotify".
- The implementation in `stats.ts` lines 97-110 counts **nodes per source** (i.e., how many unique songs appeared in each source), not scrobbles/plays.
- Test expectations confirm this: comments say "3 nodes", "1 node", "2 nodes".
- To count scrobbles per source, the data model would need per-source play counts on each node (e.g., `sourcePlays: Record<ListeningSource, number>`). Currently `GraphNode.sources` is just `ListeningSource[]` (which sources contributed any plays).

**Impact:** The `sourceBreakdown` metric is misleading — it reports node counts labeled implicitly as scrobble counts. However, the metric is only used in the stats panel and doesn't affect graph visualization or analysis.

**Recommendation:** Schedule a data model change to track per-source play counts during graph construction, then update `computeStats` to sum them.

## Notes

- Triage only. No production fix in this ticket.
