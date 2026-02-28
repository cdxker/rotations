# 01 — Fix sourceBreakdown Semantics

## Summary

Change `sourceBreakdown` in `computeStats` to count scrobbles/plays per source instead of unique nodes per source, matching the spec definition.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` tickets in this phase

## Source

- Triage: `phase6-triage/01-Triage-SourceBreakdownSemantics.md` (Schedule)
- BugBot comment: `discussion_r2867742364`

## Implementation Steps

- [ ] Add `sourcePlays: Record<ListeningSource, number>` (or similar) to `GraphNode` in `types.ts` to track per-source play counts during graph construction.
- [ ] Update `getOrCreateNode()` in `build-graph.ts` to increment per-source counts instead of just recording source presence.
- [ ] Update `computeStats()` in `stats.ts` to sum `sourcePlays` values instead of counting nodes.
- [ ] Update `sourceBreakdown` tests to assert scrobble counts instead of node counts.
- [ ] Update database schema if per-source play counts need persistence.

## Exit Criteria

- [ ] `sourceBreakdown` reports scrobble counts per source matching the spec.
- [ ] All existing tests pass (with updated assertions).
