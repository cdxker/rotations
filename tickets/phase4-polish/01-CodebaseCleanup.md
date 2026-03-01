# 01 — Codebase Cleanup

**Owner:** Dev
**Status:** Done

## Summary

Consolidate dead code, merge redundant type files, and DRY up repeated patterns across the codebase.

## Acceptance Criteria

- [X] Delete dead files: `GraphContext.tsx`, `GraphFilters.tsx`, `GraphTooltip.tsx`, `graph-types.ts`, `ingestion/types.ts`
- [X] Merge frontend types (`SongKey`, `ListeningSource`, etc.) into `graph-api.ts`
- [X] Merge raw types (`RawScrobble`, etc.) into `build-graph.ts`
- [X] Inline `GraphTooltip` into `GraphView.tsx`
- [X] Merge `GraphFilters` filter logic into `GraphEvents.tsx`
- [X] DRY up pipeline route error handlers with `pipelineHandler()` in `app.ts`
- [X] Export `nodeSize()` from `graph-api.ts`, used by `useGraphData.ts`
- [X] All existing tests pass (125 backend + 27 frontend)
- [X] Net reduction in files and lines of code

## Result

- **Baseline**: 5,238 source lines across 30 files
- **Final**: 5,195 source lines across 25 files (-43 lines, -5 files)
