# 02 — Fix source_plays Incremental Merge

## Summary

In `database.ts`, the `source_plays` column uses `COALESCE(excluded.source_plays, nodes.source_plays)` on conflict, which replaces the entire JSON blob instead of merging per-source counts. This is inconsistent with `total_plays` (which sums) and `sources` (which set-unions). Although the pipeline currently clears tables before save (making incremental merge moot), the upsert logic should be correct for future use and consistency.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `02-*` tickets in this phase

## Source

- BugBot comment on PR #63 (2026-03-01): "Incremental save overwrites `source_plays` instead of merging"

## Implementation Steps

- [ ] In `database.ts` `saveGraph` transaction (around line 112–138), merge `source_plays` in JS the same way `sources` is merged — read existing value, JSON.parse, merge per-source counts additively, then pass the merged result.
- [ ] Update the SQL to use `excluded.source_plays` (since JS now handles the merge, like it does for `sources`).
- [ ] Add a test case in `database.test.ts` "supports incremental updates" block that verifies `source_plays` merges correctly across two saves (e.g., first save `{"lastfm": 3}`, second save `{"spotify-recent": 2}`, result `{"lastfm": 3, "spotify-recent": 2}`).

## Exit Criteria

- [ ] Incremental saves correctly merge per-source play counts.
- [ ] Test covers the merge behavior.
- [ ] All existing tests pass.
