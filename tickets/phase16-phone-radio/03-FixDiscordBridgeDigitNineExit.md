# 03 — Fix Discord Bridge Digit Nine Exit

## Problem

The Discord bridge NCCO connects the call to a WebSocket without registering
asynchronous DTMF input. Once the bridge starts, pressing `9` never reaches
`/input/digit`, so the existing Discord-mode exit path cannot reopen playlist
selection.

## Goal

Keep digit input subscribed while Discord audio is connected so callers can
press `9` to leave the bridge and return to playlist selection.

## Requirements

- Add asynchronous DTMF input to the Discord bridge NCCO before its WebSocket
  connect action.
- Post bridge digits to `/input/digit?uuid=<call UUID>`.
- Preserve digits `1` and `2` as inert while the listener is in Discord mode.
- Preserve the existing digit `9` flow that detaches the bridge and transfers
  the call to playlist selection.
- Add focused regression coverage for the Discord bridge NCCO.

## Owner

Dev

## Acceptance Criteria

- [X] The Discord bridge NCCO subscribes to asynchronous DTMF input.
- [X] The digit callback URL contains the active call UUID.
- [X] The DTMF action is active before the WebSocket connect action.
- [X] Existing Discord-mode digit routing tests pass.
- [X] `pnpm --filter phone-radio test` passes.
- [X] `pnpm --filter phone-radio lint` passes.
- [X] `pnpm --filter phone-radio build` passes.

## Files

- `phone-radio/src/utils/buildDiscordBridgeNcco.ts`
- `phone-radio/test/discord-bridge-manager.test.ts`
