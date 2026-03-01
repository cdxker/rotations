# 04 — Fix Bootstrap Reducer Race with GraphEvents

## Summary

`GraphInner`'s effect sets bootstrap sigma reducers and calls `onSelectNode` to auto-focus a node. But `GraphEvents`'s reducer effect runs in the same React commit while `selectedNode` is still `null`, hitting the early-return path that clears all reducers. The auto-selected state only propagates on the next render cycle, creating a brief window where the "always-focused" invariant is violated.

## Owner

Dev

## Dependencies

- None

## Source

- BugBot comment on PR #63: "Bootstrap reducers cleared by GraphEvents on initial mount"

## Implementation Steps

- [ ] In GraphEvents reducer effect, skip clearing reducers when there is no activeNode but `externalSelectedKey` is non-null (selection is in-flight).
- [ ] Alternatively, ensure the bootstrap selection propagates before GraphEvents runs its first reducer pass.

## Exit Criteria

- [ ] No brief flash of un-highlighted graph on initial load.
- [ ] All existing tests pass.
