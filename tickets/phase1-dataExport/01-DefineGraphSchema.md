# 01 — Define Graph Schema

## Summary

Define the TypeScript types that represent the listening graph. These types are the contract that every other ticket builds against.

## Owner

Dev

## Dependencies

- `00-ProjectSetup.md`

## Context — Existing Types

`FuckingTrack` already exists in `site/src/shared/types.ts`:

```typescript
export interface FuckingTrack {
    id: TrackId
    time_ms: number
    name: string
    artists: string[]
    tags?: string[]
    audio: AudioSource
    next_tracks?: Record<PlaylistId, TrackId>
}
```

The `next_tracks` field is already a graph edge concept — it maps playlist IDs to the next track in that playlist. The new graph schema extends this idea to capture **all** sequential transitions across listening history, not just playlist ordering.

Key differences:
- `FuckingTrack.next_tracks` is per-playlist, keyed by `PlaylistId` → one next track per playlist.
- `GraphNode.next` is aggregated across all sources, keyed by `SongKey` → weighted count of how many times that transition occurred.
- `TrackId` is a branded string (`track-${string}`), while `SongKey` is a canonical identity (`artist::track_name`) used for cross-source matching.

## Acceptance Criteria

- [ ] Define `SongKey` — canonical identity: `lowercase(artist) + "::" + lowercase(track_name)`
- [ ] Define `GraphNode`:
  - `name: string`
  - `artists: string[]`
  - `albumName?: string`
  - `spotifyId?: string`
  - `lastfmUrl?: string`
  - `trackId?: TrackId` — link back to `FuckingTrack.id` if this song exists in the local library
  - `next: Record<SongKey, number>` — weighted outgoing edges
  - `previous: Record<SongKey, number>` — weighted incoming edges
  - `totalPlays: number`
  - `sources: ("lastfm" | "spotify-recent" | "spotify-playlist")[]`
- [ ] Define `ListeningGraph`:
  - `nodes: Record<SongKey, GraphNode>`
  - `metadata: { totalScrobbles, dateRange, exportTimestamp, lastfmUsername?, spotifyUsername? }`
- [ ] Define raw ingestion types (what the fetchers output before graph construction)
- [ ] Document the relationship between `SongKey`, `TrackId`, and `FuckingTrack` clearly in code comments
- [ ] Types should be importable by both the graph pipeline and (eventually) `site/`

## Notes

- Song matching across sources is imperfect. The `artist::track` normalization handles most cases. Fuzzy matching is a future enhancement.
- Consider a helper function `toSongKey(artist: string, track: string): SongKey` as part of this ticket.
