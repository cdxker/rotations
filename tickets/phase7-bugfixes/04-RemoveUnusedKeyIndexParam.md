# 04 — Remove Unused `keyIndex` Parameter from `computeClusterStats`

## Summary

The `keyIndex` parameter (`Map<SongKey, number>`) is passed to `computeClusterStats` but never referenced inside the function body. It's dead code that adds confusion.

## Owner

Dev

## Dependencies

- None

## Source

- BugBot comment on PR #63: "Unused `keyIndex` parameter in `computeClusterStats`"

## Implementation Steps

- [ ] Remove `keyIndex` parameter from `computeClusterStats` function signature.
- [ ] Remove `keyIndex` argument from call site on line ~198.

## Exit Criteria

- [ ] `keyIndex` no longer passed to or declared by `computeClusterStats`.
- [ ] All existing tests pass.
