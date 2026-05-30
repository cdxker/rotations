# 00 — Phone Radio Scaffold

## Owner

Dev

## Goal

Create a new `phone-radio` workspace package with an Express-only server for the Vapi phone webhook.

## Requirements

- Add `phone-radio` to the pnpm workspace.
- Add TypeScript ESM package config and `tsconfig.json`.
- Add an `.env.example` documenting the required configuration.
- Add one exported request handler named `phoneRadio`.
- Wire `POST /vapi` to `phoneRadio`.
- Do not use Astro or Hono.

## Acceptance Criteria

- `phone-radio/src/index.ts` exports `phoneRadio`.
- The server listens on `PHONE_RADIO_PORT`, defaulting to `3010`.
- The scaffold builds with TypeScript once dependencies are installed.
