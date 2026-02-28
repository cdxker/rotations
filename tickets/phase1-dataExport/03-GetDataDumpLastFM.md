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

- [ ] Call `user.getRecentTracks` API endpoint
- [ ] Handle pagination: up to 200 tracks per page, iterate through all pages
- [ ] Rate limiting: ~1 request/sec to stay safe (5/sec max per Last.fm docs)
- [ ] Handle edge cases:
  - "Now playing" tracks (no timestamp, skip or flag them)
  - Duplicate scrobbles
  - Missing artist/track names
- [ ] Output: raw JSON file with all scrobbles, each containing: artist, track name, album, timestamp
- [ ] Progress logging: show current page / estimated total during fetch
- [ ] Resume support: if the fetch is interrupted, be able to pick up where you left off (e.g. save last timestamp fetched)
- [ ] Store output as JSON file (pending `02-DataStorage.md` for permanent storage)

## Notes

- A user with years of history can have 100k+ scrobbles. At 200/page and 1 req/sec, that's ~500+ seconds (~8 minutes) for a full export. Progress logging is important.
- The JSON output format should match the raw ingestion types defined in `01-DefineGraphSchema.md`.
