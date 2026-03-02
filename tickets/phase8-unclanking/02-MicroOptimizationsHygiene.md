# 02 — Micro-optimizations & Code Hygiene

## Summary

Final sweep across both projects: trim verbose JSDoc, fix Vercel React best practices violations, extract small helpers, and remove dead code. (~200 lines)

## Owner

Dev

## Dependencies

- `01-BackendSourceDedup` — must be complete
- `01-FrontendComponentConsolidation` — must be complete

## Acceptance Criteria

- [ ] Excessive JSDoc in `graph-pipeline/src/graph/types.ts` trimmed (keep non-obvious fields, remove `name: string` level docs)
- [ ] `emptyResult()` helper extracted in `paths.ts` for duplicate PathResult construction
- [ ] `associations.ts` `findPlaylistForTrack` refactored to use Map lookup instead of `.some()` (Vercel `js-set-map-lookups`)
- [ ] `store.ts` getTracks/getPlaylists and `graph-api.ts` filterGraph consolidated into single iterations (Vercel `js-combine-iterations`)
- [ ] Unused imports, stray `console.log`s, and verbose intermediate variables removed across all files
- [ ] All tests pass in both projects
- [ ] All pages render correctly
- [ ] Net reduction: ~200 lines

## Notes

- Vercel best practices violations identified:
  - `js-set-map-lookups`: `associations.ts` uses `.some()` in loop where Map would be O(1)
  - `js-combine-iterations`: multiple sequential `.filter()/.map()` chains in store.ts and graph-api.ts
- This is a sweep ticket — touch many files with small changes
