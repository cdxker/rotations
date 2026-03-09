# 03 — Update app.ts, verify tests, and reindex

## Summary

Verify all imports resolve in `graph-server/`, update test paths, update `reindex.sh`, and run a full end-to-end reindex to confirm the pipeline works.

## Owner

Dev

## Dependencies

- `01-RewriteSpotifyAuth.md`
- `02-RewriteSpotifyClient.md`

## Acceptance Criteria

- [ ] `graph-server/src/server/app.ts` imports resolve (class names unchanged)
- [ ] Test import paths point to `graph-server` instead of `graph-pipeline`
- [ ] `pnpm test` passes in `graph-server/`
- [ ] `tsc --noEmit` passes (no type errors)
- [ ] `reindex.sh` updated: `PIPELINE_DIR` points to `graph-server` instead of `graph-pipeline`
- [ ] Start server (`cd graph-server && pnpm dev`), run `./reindex.sh` — pipeline completes successfully
