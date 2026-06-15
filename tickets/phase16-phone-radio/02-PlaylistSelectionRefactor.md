# Playlist Selection Refactor

Owner: Dev
Status: Done

## Plan

Phone Radio should support playlist selection during an active call. Pressing `9` at any time opens a playlist-selection prompt, asks the caller to press a playlist number followed by `#`, and moves the active call to the selected playlist.

Use Vonage's synchronous NCCO `input` action with DTMF `submitOnHash` for the playlist selector. Keep the existing asynchronous DTMF subscription during normal playback so `1`, `2`, and `9` remain available while audio is streaming.

## Implementation

- Replace the single `tracks.ts` list with a `playlists/` folder.
- Add stable playlist metadata with numeric selector codes, names, and track arrays.
- Store both active playlist number and active track index in Redis:
  - `listener:{uuid}:playlist`
  - `listener:{uuid}:track`
- Default new callers to the default playlist at track `0`.
- Add a playlist selector NCCO that says "Press any number followed by the pound sign." and posts collected digits to `/input/playlist`.
- Update playback NCCOs and track routes to include playlist number so stale callbacks from a previous playlist cannot advance the new playlist.
- Update route handling:
  - `1`: previous track in active playlist.
  - `2`: next track in active playlist.
  - `9`: transfer to playlist selector prompt.
  - `/input/playlist`: switch to a valid playlist number, or return to current playback after an invalid/empty selection.

## Acceptance Criteria

- [X] New callers start on the default playlist.
- [X] Pressing `9` transfers the call to a playlist selector prompt.
- [X] Entering a valid playlist number followed by `#` switches playlists and starts track `0`.
- [X] Invalid playlist input returns the caller to the current playlist.
- [X] Track finish callbacks include playlist number and ignore stale playlist callbacks.
- [X] Unit tests cover playlist state, selector input, route behavior, and stale callback protection.
- [X] `pnpm --filter phone-radio test` passes.
- [X] `pnpm --filter phone-radio build` passes.
