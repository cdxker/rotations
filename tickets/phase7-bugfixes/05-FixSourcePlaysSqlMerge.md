# 05 — Fix source_plays SQL Upsert to Merge Additively

## Summary

The SQL upsert for `source_plays` uses `COALESCE(excluded.source_plays, nodes.source_plays)` which simply picks the new value over the old one. The additive merge only works because TypeScript code pre-merges before the SQL runs. The SQL itself should merge per-source counts additively, matching how `total_plays` and `weight` do it at the SQL level.

## Owner

Dev

## Dependencies

- None

## Source

- BugBot comment on PR #63: "Database source_plays upsert silently overwrites instead of merging"

## Implementation Steps

- [ ] In `database.ts`, update the `source_plays` upsert to parse and merge JSON per-source counts at the SQL level, or document clearly that the TS pre-merge is the intended merge point.
- [ ] Add a test verifying incremental saves merge source_plays correctly.

## Exit Criteria

- [ ] source_plays are merged additively on upsert, not overwritten.
- [ ] All existing tests pass.
