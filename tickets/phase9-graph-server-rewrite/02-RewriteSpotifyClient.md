# 02 — Rewrite spotify-client.ts

## Summary

Delete contents of `graph-server/src/ingestion/spotify-client.ts` and rewrite from scratch. Strip all docstrings, inline all standalone interfaces and helper functions. Keep the same public API.

## Owner

Dev

## Dependencies

- `00-CopyGraphPipeline.md`

## Parallelizable With

- `01-RewriteSpotifyAuth.md`

## Must export (same public API)

- `type SpotifyDump` — `{ recentlyPlayed, playlistTracks, exportedAt }`
- `class SpotifyClient` — constructor `(auth: SpotifyAuth)`

## Public methods to keep (same signatures)

- `request<T>(url: string): Promise<T>` — authenticated fetch, retry on 429 (up to 3), re-auth on 401
- `getRecentlyPlayed(): Promise<RawSpotifyRecentTrack[]>` — fetch 50 recent, filter non-tracks, map fields
- `getAllPlaylists(): Promise<{ id: string; name: string; tracks: { total: number } }[]>` — paginated fetch
- `getPlaylistTracks(id: string, name: string): Promise<RawSpotifyPlaylistTrack[]>` — paginated, skip nulls/episodes, track position
- `fetchAll(): Promise<SpotifyDump>` — combine recent + all playlist tracks
- `exportToJson(path: string, dump?: SpotifyDump): Promise<SpotifyDump>` — write to file

## What to remove/inline

- All JSDoc comments
- All standalone interfaces (`SpotifyArtistRef`, `SpotifyImage`, `SpotifyAlbumRef`, `SpotifyTrackObject`, `RecentlyPlayedItem`, `RecentlyPlayedResponse`, `PlaylistSummary`, `PaginatedResponse`, `PlaylistTrackItem`) — use inline types or type at the call site
- `pickImageUrl()` standalone function — inline where used
- `sleep()` standalone function — inline where used

## Behavior to preserve

- 429 retry with `Retry-After` header (max 3 retries)
- 401 triggers `auth.refreshAccessToken()` and retry
- Podcast episodes filtered (type !== "track")
- Null tracks skipped
- Local files get empty string spotifyId
- Position tracking across paginated playlist tracks
- Image selection: prefer 200-400px height, fallback to first

## Acceptance Criteria

- [ ] File rewritten with no docstrings, no standalone interfaces, no helper functions
- [ ] All interfaces inlined or typed at call site
- [ ] `pickImageUrl()` and `sleep()` inlined
- [ ] Existing tests pass unchanged
