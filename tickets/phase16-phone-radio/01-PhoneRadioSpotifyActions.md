# 01 — Phone Radio Spotify Actions

## Owner

Dev

## Goal

Implement the Spotify actions required by the Vapi phone menu inside the single `phoneRadio` handler.

## Requirements

- Refresh a Spotify access token using `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_PHONE_REFRESH_TOKEN`.
- Handle Vapi tools:
  - `play_playlist`
  - `play_radio`
  - `queue_song`
- Search Spotify tracks by `songRef` for radio and queue actions.
- Use `SPOTIFY_PHONE_DEVICE_ID` for playback.
- Use `SPOTIFY_PHONE_DEFAULT_PLAYLIST_URI` for playlist playback.
- Return Vapi tool-call results with the original `toolCallId`.

## Acceptance Criteria

- Playlist tool starts the configured playlist.
- Radio tool starts the resolved track.
- Queue tool queues the resolved track.
- Missing env vars, unsupported tools, missing song refs, empty search results, and Spotify failures return useful Vapi results.
