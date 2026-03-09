# 01 — Create Container Entry Point

## Problem

The existing `index.ts` entry point loads `dotenv/config` and enables the pipeline worker — neither is appropriate for a Cloudflare Container. A dedicated entry point is needed.

## Goal

Create `graph-server/src/server/container-entry.ts` — a Node.js entry point for the container image that reads `DATABASE_URL` from the environment, disables the pipeline worker, and listens on port 8080.

## Requirements

### container-entry.ts

- Import `serve` from `@hono/node-server` and `createApp` from `./app.js`
- Do **not** import `dotenv/config` (env vars come from container runtime)
- Read `DATABASE_URL` from `process.env` (required — throw if missing)
- Call `createApp({ databaseUrl, enablePipelineWorker: false })`
- Default port: `process.env.PORT ?? "8080"`
- Log the port and database host on startup

## Owner

Dev

## Acceptance Criteria

- [ ] `container-entry.ts` exists and compiles without errors
- [ ] Running `DATABASE_URL=... node --import tsx src/server/container-entry.ts` starts the server on port 8080
- [ ] Pipeline worker is not started
- [ ] No `dotenv` import

## Files

- `graph-server/src/server/container-entry.ts` (create)
