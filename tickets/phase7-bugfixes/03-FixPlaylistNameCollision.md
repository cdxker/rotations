# 03 — Fix Playlist Grouping Name Collision

## Summary

`processSpotifyPlaylists` in `build-graph.ts` groups tracks by `playlistName` using a `Map<string, ...>`. If a user has two distinct Spotify playlists with the same name, their tracks are merged into one playlist for edge construction, producing incorrect transition edges between unrelated tracks.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `03-*` tickets in this phase

## Source

- BugBot comment on PR #63: "Playlist grouping by name merges distinct playlists"

## Implementation Steps

- [ ] Add a `playlistId` field to `RawSpotifyPlaylistTrack` in `build-graph.ts` (sourced from the Spotify API's playlist URI/ID).
- [ ] Update `SpotifyClient.fetchAll()` in `spotify-client.ts` to include the playlist ID in each track record.
- [ ] In `processSpotifyPlaylists`, key the grouping map by `playlistId` instead of `playlistName`.
- [ ] Add a test with two playlists sharing a name but different IDs to verify they are not merged.

## Exit Criteria

- [ ] Same-name playlists with different IDs produce separate edge groups.
- [ ] All existing tests pass.
