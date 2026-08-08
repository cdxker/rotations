# 02 — Fix Digit Transfer Commit Ordering

## Problem

Greptile flagged that `/input/digit` skip/previous handling now calls `toPreviousTrack` or `toNextTrack` before `transferCallWithNCCO`. Those service methods commit the new track index to Redis before the Vonage transfer is known to have succeeded.

If `transferCallWithNCCO` throws, Redis points at the new index while the active call is still playing the old track. A later `/track/finished/:uuid/:songIndex` webhook for the old track can then look stale and no-op, leaving playback stuck.

## Goal

Keep Redis playback state aligned with the audio the caller is actually hearing when digit-triggered transfers fail.

## Requirements

- Update the digit skip/previous flow so Redis does not permanently advance unless the Vonage transfer succeeds.
- Preserve support for digit `1` as previous track and digit `2` as next track.
- Preserve the text-to-speech announcement before the transferred track stream.
- Keep stale finished-track callbacks from silently stranding a listener after a failed transfer.
- Add or update focused tests for transfer failure behavior.

## Owner

Dev

## Acceptance Criteria

- [X] If `transferCallWithNCCO` throws during `/input/digit`, Redis remains at the track index matching the currently playing audio.
- [X] Successful digit transfers still advance Redis and stream the requested previous/next track.
- [X] Finished-track webhook behavior remains compatible with the committed Redis index.
- [X] `pnpm --filter phone-radio test` passes.
- [X] `pnpm --filter phone-radio build` passes.

## Files

- `phone-radio/src/routes.ts`
- `phone-radio/src/playlist.service.ts`
- `phone-radio/test/playlist.service.test.ts`
