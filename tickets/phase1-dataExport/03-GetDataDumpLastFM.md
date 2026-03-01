# 03 — Get Data Dump from Last.fm

## Summary

Fetch the full scrobble history from Last.fm and output it as a raw JSON dump.

## Owner

Dev

## Dependencies

- `01-DefineGraphSchema.md` (need raw ingestion types)
- `02-ImplementLastFMAuth.md`
- `02-CreateLastFMAPIAccount.md`

## Parallelizable With

- `03-GetDataDumpSpotify.md`

## Acceptance Criteria

- [X] Call `user.getRecentTracks` API endpoint
- [X] Handle pagination: up to 200 tracks per page, iterate through all pages
- [X] Rate limiting: ~1 request/sec to stay safe (5/sec max per Last.fm docs)
- [X] Handle edge cases:
  - "Now playing" tracks (no timestamp, skip or flag them)
  - Duplicate scrobbles
  - Missing artist/track names
- [X] Output: raw JSON file with all scrobbles, each containing: artist, track name, album, timestamp
- [X] Progress logging: show current page / estimated total during fetch
- [X] Resume support: if the fetch is interrupted, be able to pick up where you left off (e.g. save last timestamp fetched)
- [X] Store output as JSON file (pending `02-DataStorage.md` for permanent storage)

## Notes

- A user with years of history can have 100k+ scrobbles. At 200/page and 1 req/sec, that's ~500+ seconds (~8 minutes) for a full export. Progress logging is important.
- The JSON output format should match the raw ingestion types defined in `01-DefineGraphSchema.md`.

## Progress

- [X] Created `src/ingestion/lastfm-fetcher.ts` — `fetchLastfmScrobbles()` function
- [X] Paginated fetcher calls `user.getRecentTracks` with 200 tracks/page
- [X] Rate limiting: 1 second sleep between page requests
- [X] Edge cases: skips now-playing (no timestamp), deduplicates by artist+track+timestamp, skips missing artist/name
- [X] Output: JSON file at `data/lastfm-scrobbles.json` matching `RawScrobble` type
- [X] Progress logging via configurable callback (page X/Y format)
- [X] Resume support: checkpoint file saves last timestamp, resumes with `from` param
- [X] `fullRefresh` option to ignore checkpoint
- [X] 9 tests covering all acceptance criteria

### Notes
- Output goes to `graph-pipeline/data/` directory (auto-created)
- Checkpoint saved every 10 pages during fetch + final checkpoint after completion
- Scrobbles sorted chronologically in output
- `tsc --noEmit` shows errors only in `spotify-client.ts` (another agent's work), not in my files
