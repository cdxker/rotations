# 01 — Skip Track Index TTS

## Problem

When a caller skips to another Phone Radio track, the call transfers directly into the next audio stream without announcing which song index is now queued.

## Goal

When a digit input queues a new song, play a text-to-speech announcement of the queued song index before the song stream starts.

## Requirements

- Keep the digit-route NCCO construction inline.
- When `/input/digit` queues a new song, add an inline text-to-speech announcement before the track stream action.
- Preserve the existing Redis track index update and finished-track notify callback.

## Owner

Dev

## Acceptance Criteria

- [X] Queuing a new song through `/input/digit` announces the queued song index before streaming the track.
- [X] The digit-route NCCO construction remains inline.
- [X] `pnpm --filter phone-radio build` passes.

## Files

- `phone-radio/src/routes.ts`
- `phone-radio/README.md`
