# 03 — Fix PathPanel Loading Guard Blocks Refetch

## Summary

When a path fetch is in-flight and the user changes the algorithm or a node, the `useEffect` cleanup sets `cancelled = true` but never resets `state.loading` to `false`. On re-run, the effect hits `if (state.loading) return` and bails out permanently. The panel is stuck at the loading spinner with no way to recover.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `03-*` tickets in this phase

## Source

- BugBot comments on PR #63: "PathPanel stuck loading when algorithm changes mid-fetch", "PathPanel loading guard blocks refetch after cancellation", "PathPanel loading guard permanently blocks new searches"

## Implementation Steps

- [ ] In `PathPanel.tsx` (line ~194–224), reset `loading` to `false` in the cleanup function when `cancelled` is set, or remove the `if (state.loading) return` guard and instead cancel + restart the fetch on dependency changes.
- [ ] Add a test that changes algorithm mid-fetch and verifies the panel recovers.

## Exit Criteria

- [ ] Changing algorithm or node selection mid-fetch triggers a new fetch instead of getting stuck.
- [ ] All existing tests pass.
