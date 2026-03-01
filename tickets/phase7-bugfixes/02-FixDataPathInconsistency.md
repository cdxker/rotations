# 02 — Fix Data Path Inconsistency

## Summary

The `/pipeline/build` endpoint in `app.ts` uses CWD-relative paths (`"data/lastfm-scrobbles.json"`, `"data/spotify-dump.json"`) while `lastfm-fetcher.ts` writes to an absolute path via `path.join(import.meta.dirname, "../../data")`. If the server's CWD isn't `graph-pipeline/`, the build endpoint can't find files that fetch just wrote.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `02-*` tickets in this phase

## Source

- BugBot comment on PR #63 (2026-03-01): "Lastfm fetch and build use inconsistent path resolution"

## Implementation Steps

- [ ] In `app.ts`, replace the CWD-relative paths on lines 264–265 with `import.meta.dirname`-based resolution matching `lastfm-fetcher.ts`.
- [ ] Also fix line 248 where `exportToJson` is called with a CWD-relative `"data/spotify-dump.json"`.
- [ ] Verify `spotify-client.ts` `exportToJson` correctly uses the path it receives (it does — no internal resolution).
- [ ] Add or update a test that confirms build can find fetched data regardless of CWD.

## Exit Criteria

- [ ] Fetch and build endpoints resolve to the same `data/` directory regardless of CWD.
- [ ] All existing tests pass.
