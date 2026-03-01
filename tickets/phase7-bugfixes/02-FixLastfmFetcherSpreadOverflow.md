# 02 — Fix Lastfm Fetcher Spread Overflow

## Summary

Replace `Math.max(...newScrobbles.map(s => s.timestamp))` in the checkpoint logic of `lastfm-fetcher.ts` with a loop-based alternative. Same class of bug as the already-fixed `build-graph.ts` spread overflow — `newScrobbles` accumulates across all pages and can exceed V8's ~65k argument limit on large histories.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `02-*` tickets in this phase

## Source

- BugBot comment on PR #63 (2026-03-01): "Spread operator in checkpoint causes stack overflow too"

## Implementation Steps

- [ ] In `lastfm-fetcher.ts` line 192–194, replace `Math.max(...newScrobbles.map((s) => s.timestamp))` with a `for...of` loop tracking max timestamp.
- [ ] Add a test with >65k mock scrobbles to confirm no `RangeError`.

## Exit Criteria

- [ ] Checkpoint logic handles 200k+ scrobbles without `RangeError`.
- [ ] All existing tests pass.
