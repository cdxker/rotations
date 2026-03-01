# 05 — Fix PathPanel Cleanup Effect Race Condition

## Summary

The `useEffect` cleanup function in PathPanel calls `onStateChange({ ...stateRef.current, loading: false })` whenever the effect re-runs. This fires *before* the new effect body runs, and can race with a just-resolved `.then()` callback — potentially overwriting a valid result with stale state plus `loading: false`.

## Owner

Dev

## Dependencies

- None

## Source

- BugBot comment on PR #63: "PathPanel cleanup effect resets loading state spuriously"

## Implementation Steps

- [ ] In `PathPanel.tsx`, only reset loading in cleanup when `cancelled` would actually prevent the promise callbacks from running (i.e. the fetch is genuinely still in-flight).
- [ ] Consider using an AbortController or moving to a pattern where cleanup only sets the `cancelled` flag without touching state.

## Exit Criteria

- [ ] Changing algorithm/node mid-fetch does not overwrite a just-resolved result.
- [ ] Loading state is still properly reset when a fetch is genuinely cancelled.
- [ ] All existing tests pass.
