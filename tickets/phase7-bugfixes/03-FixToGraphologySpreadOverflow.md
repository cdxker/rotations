# 03 — Fix toGraphology Spread Overflow

## Summary

`Math.max(...entries.map(...))` at lines 205–206 of `graph-api.ts` spreads the entire node entries array as function arguments. Same class of bug as the already-fixed `build-graph.ts` and `lastfm-fetcher.ts` spread overflows — will crash with `RangeError` on graphs with >65k nodes.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `03-*` tickets in this phase

## Source

- BugBot comment on PR #63: "Spread in `toGraphology` crashes on large graphs"

## Implementation Steps

- [ ] In `site/src/lib/graph-api.ts` lines 205–206, replace `Math.max(...entries.map(...))` with a loop-based max for both `maxPlays` and `maxPageRank`.
- [ ] Add a test in `graph-api.test.ts` that verifies `toGraphology` handles large node counts without crashing.

## Exit Criteria

- [ ] `toGraphology` handles graphs with >65k nodes without `RangeError`.
- [ ] All existing tests pass.
