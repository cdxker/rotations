# 02 — Fix Set-To-Track Stat Ordering

## Problem

Greptile flagged that `PlaylistService.setToTrack` writes the target track index to Redis before calling `stat` on the track file. If `stat` throws because the file is missing or unreadable, the method throws after Redis has already been updated.

That leaves Redis pointing at a track that cannot be returned as a `PlaylistTrack`, and callers such as `toNextTrack`, `toPreviousTrack`, and `trackFinished` can bubble an unhandled error while Redis no longer matches the audio state.

## Goal

Only commit a new Redis track index after the target track has been validated and can be returned to the caller.

## Requirements

- Reorder or restructure `setToTrack` so target track metadata is resolved before the Redis write.
- If target track resolution or `stat` fails, leave the existing Redis index unchanged.
- Return a predictable failure result instead of leaking an unhandled `stat` exception through route handlers.
- Preserve the existing wraparound behavior for next/previous track selection.
- Add or update focused tests for missing/unreadable target track files.

## Owner

Dev

## Acceptance Criteria

- [X] `setToTrack` does not change Redis when the target track cannot be validated.
- [X] Callers receive `null` or another handled failure result when target track resolution fails.
- [X] Next, previous, and finished-track advancement still work for valid target tracks.
- [X] `pnpm --filter phone-radio test` passes.
- [X] `pnpm --filter phone-radio build` passes.

## Files

- `phone-radio/src/playlist.service.ts`
- `phone-radio/test/playlist.service.test.ts`
