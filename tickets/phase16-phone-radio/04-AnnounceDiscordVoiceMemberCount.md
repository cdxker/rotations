# 04 — Announce Discord Voice Member Count

## Problem

Phone Radio starts Discord streaming without telling the caller how many
members are currently present in the selected voice channel.

## Goal

Fetch the selected voice channel's live member count and announce it to the
caller before continuing into Discord audio streaming.

## Requirements

- Read the selected voice channel's current members from the authenticated
  Discord runtime immediately before building the bridge NCCO.
- Exclude the Phone Radio bot itself from the announced count.
- Use singular and plural text-to-speech grammar for the count.
- Play the member-count announcement before DTMF subscription and WebSocket
  connection actions.
- Preserve the digit `9` exit path and existing Discord audio behavior.
- Add focused runtime, route, and NCCO regression coverage.

## Owner

Dev

## Acceptance Criteria

- [X] The live member count is fetched for the selected destination.
- [X] The Phone Radio bot is not included in the count.
- [X] Singular and plural announcements are correct.
- [X] The announcement precedes DTMF subscription and WebSocket connection.
- [X] Existing Discord routing and streaming tests pass.
- [X] `pnpm --filter phone-radio test` passes.
- [X] `pnpm --filter phone-radio lint` passes.
- [X] `pnpm --filter phone-radio build` passes.

## Files

- `phone-radio/src/discord/runtime.ts`
- `phone-radio/src/routes.ts`
- `phone-radio/src/utils/buildDiscordBridgeNcco.ts`
- `phone-radio/test/discord-runtime.test.ts`
- `phone-radio/test/routes.test.ts`
- `phone-radio/test/discord-bridge-manager.test.ts`
