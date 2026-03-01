# 03 — Get Data Dump from Spotify

## Summary

Fetch recently played tracks and all playlist track orderings from Spotify. Output as raw JSON.

## Owner

Dev

## Dependencies

- `01-DefineGraphSchema.md` (need raw ingestion types)
- `02-ImplementSpotifyOAuth.md`
- `02-CreateSpotifyDeveloperApp.md`

## Parallelizable With

- `03-GetDataDumpLastFM.md`

## Acceptance Criteria

- [ ] **Recently Played**: Call `/v1/me/player/recently-played` (max 50 tracks). Extract: track name, artists, album, played_at timestamp, Spotify ID.
- [ ] **Playlists**:
  - Fetch all user playlists via `/v1/me/playlists` (paginated)
  - For each playlist, fetch full track listing via `/v1/playlists/{id}/tracks` (paginated)
  - Preserve track ordering within each playlist (this becomes edge data)
- [ ] Handle Spotify API rate limits (429 responses with Retry-After header)
- [ ] Handle edge cases:
  - Local files in playlists (no Spotify ID)
  - Podcast episodes mixed into playlists
  - Empty playlists
  - Collaborative playlists
- [ ] Output: raw JSON file with two sections — recently played tracks and playlist track orderings
- [ ] Store output as JSON file (pending `02-DataStorage.md` for permanent storage)

## Notes

- Spotify recently played is limited to 50 tracks — this is a small dataset compared to Last.fm. The real value from Spotify is playlist ordering data.
- The existing `site/` project already fetches Spotify playlists (`SpotifyView.tsx`). Review that code for patterns to reuse.

## Progress

- [X] Implement SpotifyClient class with rate limiting and pagination
- [X] Implement recently played fetcher
- [X] Implement playlist + tracks fetcher (handles edge cases)
- [X] Add JSON export function
- [X] Add tests (8 tests passing)
- [X] Verify compilation (tsc --noEmit clean)
