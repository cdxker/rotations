# 00 — Install @cloudflare/containers Dependency

## Problem

The Cloudflare Containers SDK is required to create a Worker that manages a container lifecycle. It's not yet installed.

## Goal

Add `@cloudflare/containers` as a dev dependency to `graph-server`.

## Requirements

```bash
cd graph-server && pnpm add -D @cloudflare/containers
```

## Owner

Dev

## Acceptance Criteria

- [ ] `@cloudflare/containers` is listed in `graph-server/package.json` devDependencies
- [ ] `pnpm install` succeeds cleanly

## Files

- `graph-server/package.json`
- `pnpm-lock.yaml`
