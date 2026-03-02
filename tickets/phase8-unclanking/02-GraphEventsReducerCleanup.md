# 02 — GraphEvents Reducer Cleanup

## Summary

Decompose the 477-line `GraphEvents.tsx` by extracting filter logic into a hook and consolidating the verbose node/edge reducer cascades. (~100 lines)

## Owner

Dev

## Dependencies

- `01-FrontendComponentConsolidation` — must be complete (touches graph components)

## Acceptance Criteria

- [ ] Filter logic (lines 414-474) extracted into `useGraphFilter(sigma, filter, onStatsChange)` hook
- [ ] Node/edge reducer cascading if/else consolidated into shared `classifyNode()` helper that returns `{color, zIndex, highlighted, hidden}`
- [ ] Debug logging (`graphDebug` calls) removed from GraphEvents
- [ ] Graph renders correctly with node selection, neighbor highlighting, depth mode, and filtering
- [ ] `yarn test` passes in `site/`
- [ ] Net reduction: ~100 lines

## Notes

- GraphEvents mixes three concerns: Sigma event registration, node/edge reducers for highlighting, and filter logic
- The node reducer (lines 274-330) and edge reducer (lines 332-388) have similar branching patterns that can share a classification function
- Depth mode and standard mode branches share the "is this node active/neighbor/other" pattern
