# 02 — Expand Playlist Catalog

## Problem

The active phone-radio catalog contains playlist updates and additional playlists that are not registered in the playlist index or reflected in the canonical song list.

## Goal

Publish the current playlist 1–8 and 11–12 catalog as one coherent phone-radio content update.

## Requirements

- Preserve the active track ordering for playlists 1, 2, and 3.
- Register playlists 5, 6, 7, 8, 11, and 12.
- Keep every playlist number unique.
- Regenerate `phone-radio/song-list.txt` from the playlist registry.
- Do not add unrelated playlist notes or scratch files.

## Owner

Dev

## Acceptance Criteria

- [X] All registered playlists build successfully.
- [X] The generated song list matches the playlist registry.
- [X] Phone-radio tests pass.
- [X] Phone-radio build passes.

## Files

- `phone-radio/src/playlists/`
- `phone-radio/song-list.txt`
