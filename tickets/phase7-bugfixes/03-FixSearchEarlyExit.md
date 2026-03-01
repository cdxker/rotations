# 03 — Fix Search forEachNode Early Exit

## Summary

`graph.forEachNode` in both `SearchBar.tsx` and `PathPanel.tsx` does not support early exit — `return` inside the callback only returns from that invocation, it does not break iteration. This means every keystroke scans the entire graph (potentially 10k–100k nodes) even after 20 matches are found.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `03-*` tickets in this phase

## Source

- BugBot comments on PR #63: "Search `forEachNode` return doesn't stop iteration", "Search iterates all graph nodes without early exit", "Search iteration scans all nodes without early exit"
- Original triage ticket `01-Triage-SearchNoEarlyExit` incorrectly closed as invalid

## Implementation Steps

- [ ] In `SearchBar.tsx` (line ~41), replace `graph.forEachNode` with a `for...of` loop over `graph.nodes()` that `break`s after 20 matches.
- [ ] In `PathPanel.tsx` (line ~44), apply the same fix.
- [ ] Verify search still works correctly with existing frontend tests.

## Exit Criteria

- [ ] Search stops iterating after collecting enough matches.
- [ ] All existing tests pass.
