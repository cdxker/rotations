# 00 — Redis Single Track Queue

## Problem

Phone Radio currently queues the full track list in the `/answer` NCCO, so the server has no minimal per-listener state for the current track and cannot make skip behavior depend on the phone call UUID.

## Goal

Use Redis as the single source of truth for the queued track index at `listener:{uuid}:track`, and queue one track at a time with a follow-up notify callback that queues the next track.

## Requirements

- On `/answer`, set `listener:{uuid}:track` to `0` in Redis.
- `/answer` returns exactly one song stream plus a notify action for `/track/finished/:uuid`.
- `/track/finished/:uuid` reads `listener:{uuid}:track`, advances to the next track, writes the updated index, and returns the next one-song NCCO with the same notify callback.
- Rename the DTMF route from `/handleDigitPress` to `/input/digit`.
- When `/input/digit` receives digit `2`, read the Redis key, advance to the next track, write the updated index, and transfer the active call to that next one-song NCCO.
- Add Redis local development setup.

## Owner

Dev

## Acceptance Criteria

- [X] `listener:{uuid}:track` is the only Redis playback state needed for a listener.
- [X] The `/answer` route no longer queues the full track list.
- [X] Finished-track notify callbacks advance to the next track.
- [X] Digit `2` skips to the next track.
- [X] Local Redis can be started from Docker Compose.
- [X] `pnpm --filter phone-radio build` passes.

## Files

- `phone-radio/src/index.ts`
- `phone-radio/package.json`
- `phone-radio/.env.example`
- `phone-radio/README.md`
- `docker-compose.yaml`
- `pnpm-lock.yaml`
