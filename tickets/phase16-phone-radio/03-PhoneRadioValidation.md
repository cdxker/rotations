# 03 — Phone Radio Validation

## Owner

Dev

## Goal

Validate the phone-radio server build and webhook behavior.

## Requirements

- Run the TypeScript build for `phone-radio`.
- Provide manual curl payloads for playlist, radio, and queue flows.
- Verify errors for unsupported tools and missing song refs.

## Acceptance Criteria

- `pnpm --filter phone-radio build` passes.
- Validation commands are documented.
