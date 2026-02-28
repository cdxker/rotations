# 01 — Fix Spotify Double Fetch

## Summary

Eliminate the redundant `fetchAll()` call in `/pipeline/fetch/spotify` by passing the already-fetched dump to the export function instead of re-fetching.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` tickets in this phase

## Source

- Triage: `phase6-triage/01-Triage-SpotifyFetchDoubleCall.md` (Schedule)
- BugBot comment: `discussion_r2867888533`

## Implementation Steps

- [ ] Modify `exportToJson()` in `spotify-client.ts` to accept an optional `dump` parameter. If provided, skip the internal `fetchAll()` call and write the provided data directly.
- [ ] Update the `/pipeline/fetch/spotify` handler in `app.ts` to pass the already-fetched `dump` to `exportToJson()`.
- [ ] Add or update tests to verify only one fetch cycle occurs.

## Exit Criteria

- [ ] `/pipeline/fetch/spotify` makes exactly one set of Spotify API calls per request.
- [ ] All existing tests pass.
