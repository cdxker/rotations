# 01 — Fix Timestamp Spread Overflow

## Summary

Replace `Math.min(...allTimestamps)` and `Math.max(...allTimestamps)` in `buildGraph` with loop-based alternatives to prevent stack overflow on large datasets (>65k scrobbles).

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` tickets in this phase

## Source

- Triage: `phase6-triage/01-Triage-TimestampSpreadOverflow.md` (Schedule)
- BugBot comments: `discussion_r2867888537`, `discussion_r2867946197`

## Implementation Steps

- [ ] In `build-graph.ts` lines 260-267, replace `Math.min(...allTimestamps)` with `allTimestamps.reduce((min, t) => Math.min(min, t), Infinity)` (or equivalent loop).
- [ ] Same for `Math.max(...)`.
- [ ] Also check `allTimestamps.push(...result.timestamps)` — replace with `for...of` loop or `Array.prototype.push.apply` if the timestamps array itself can be large.
- [ ] Add a test with >100k timestamps to verify no crash.

## Exit Criteria

- [ ] `buildGraph` handles 200k+ timestamps without `RangeError`.
- [ ] All existing tests pass.
