# 01 — Fix Pipeline Rerun Data Doubling

## Summary

Make `/pipeline/build` and `/pipeline/run` idempotent by clearing graph tables before saving, preventing additive accumulation of node play counts and edge weights on repeated runs.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` tickets in this phase

## Source

- Triage: `phase6-triage/01-Triage-PipelineRerunDoublesData.md` (Schedule)
- BugBot comment: `discussion_r2867888536`

## Implementation Steps

- [ ] Add `DELETE FROM edges; DELETE FROM nodes;` (or equivalent clear method) before `saveGraph()` in the `/pipeline/build` and `/pipeline/run` handlers in `app.ts`.
- [ ] Alternatively, change edge upsert from additive (`weight = edges.weight + excluded.weight`) to replacement (`weight = excluded.weight`) in `database.ts`.
- [ ] Add a test verifying that running `saveGraph` twice with the same data produces identical counts.

## Exit Criteria

- [ ] Running `/pipeline/build` twice with the same source data produces identical node counts and edge weights.
- [ ] All existing tests pass.
