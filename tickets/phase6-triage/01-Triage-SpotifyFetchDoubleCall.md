# 01 — TRIAGE: Spotify Fetch Endpoint Calls `fetchAll()` Twice

## Summary

Assess whether `/pipeline/fetch/spotify` performs duplicate Spotify API fetches per request.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comments: `discussion_r2867742361`, `discussion_r2867888533`

## Triage Steps

- [ ] Verify current call flow in endpoint and client implementation.
- [ ] Reproduce duplicate network behavior or prove false.
- [ ] Estimate rate-limit and performance risk.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Schedule**

**Evidence:**
- In `app.ts` lines 247-248, the `/pipeline/fetch/spotify` route calls `client.fetchAll()` to get the dump, then calls `client.exportToJson()` which internally calls `fetchAll()` again (line 262 in `spotify-client.ts`).
- This results in two full Spotify API fetch cycles per request (recently played + all playlists), doubling API calls and risking rate limits.
- Fix: pass the already-fetched `dump` to `exportToJson()` or add an optional parameter to accept pre-fetched data.

**Impact:** Doubles Spotify API calls on each fetch request. Spotify rate limits are generous but this is wasteful and could cause issues with large playlist collections.

**Recommendation:** Schedule a quick fix to pass the existing `dump` to a write-only export function.

## Notes

- Triage only. No production fix in this ticket.
