# 01 — Fix PathPanel Stale Async State

## Summary

Fix the race condition in `PathPanel.tsx` where async `fetchPath()` callbacks spread stale `state` from closures, potentially overwriting newer UI state.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` tickets in this phase

## Source

- Triage: `phase6-triage/01-Triage-PathPanelStaleAsyncState.md` (Schedule)
- BugBot comment: `discussion_r2867742359`

## Implementation Steps

- [ ] In `PathPanel.tsx` lines 191-222, replace `onStateChange({ ...state, loading: false, result })` with a functional update that only sets the changed fields: `onStateChange(prev => ({ ...prev, loading: false, result, error: ... }))`.
- [ ] Same for the `.catch()` handler.
- [ ] Verify that the `cancelled` flag cleanup still works correctly with the new pattern.

## Exit Criteria

- [ ] Changing path parameters while a request is in flight does not revert UI state.
- [ ] All existing tests pass.
