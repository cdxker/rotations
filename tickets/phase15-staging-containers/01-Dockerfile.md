# 01 — Create Dockerfile for Graph Server

## Problem

Cloudflare Containers builds and runs a Docker image. The graph-server needs a Dockerfile.

## Goal

Create `graph-server/Dockerfile` and `graph-server/.dockerignore` to produce a minimal container image that runs the API server.

## Requirements

### Dockerfile

- Base image: `node:22-slim`
- Install pnpm globally via corepack
- Copy `package.json`, `pnpm-lock.yaml` from root and `graph-server/`
- `pnpm install --frozen-lockfile` (production deps + tsx)
- Copy source files
- Expose port 8080
- CMD: `node --import tsx src/server/container-entry.ts`
- Working directory: `/app/graph-server`

### .dockerignore

Ignore `node_modules`, `dist`, `.env*`, `*.md`, `tests/`, `.git`

### Monorepo consideration

The `pnpm-lock.yaml` lives at the repo root. The Dockerfile context should be the repo root, or copy the lockfile into the image. The `wrangler.toml` `image` path should account for this (e.g., `image = "./Dockerfile"` with build context set appropriately).

## Owner

Dev

## Acceptance Criteria

- [ ] `docker build -f graph-server/Dockerfile .` succeeds from repo root
- [ ] Container starts and listens on port 8080 when given `DATABASE_URL`
- [ ] Image size is reasonable (< 500MB)
- [ ] `.dockerignore` excludes unnecessary files

## Files

- `graph-server/Dockerfile` (create)
- `graph-server/.dockerignore` (create)
