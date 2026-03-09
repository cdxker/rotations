# 02 — Update wrangler.toml for Containers

## Problem

The current `wrangler.toml` is configured for Hyperdrive (managed Postgres proxy). The container-based deployment needs Containers + Durable Objects configuration instead.

## Goal

Rewrite `graph-server/wrangler.toml` to use Cloudflare Containers for staging, keeping the existing Hyperdrive config for production.

## Requirements

### Top-level (production — unchanged for now)

Keep the existing production Hyperdrive config as-is. Production will migrate to containers later.

### Staging environment

```toml
[env.staging]
name = "everysong-api-staging"
main = "src/server/container-worker.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[env.staging.containers]]
class_name = "GraphApiContainer"
image = "./Dockerfile"
instance_type = "basic"

[[env.staging.durable_objects.bindings]]
name = "GRAPH_API_CONTAINER"
class_name = "GraphApiContainer"

[[env.staging.migrations]]
tag = "v1"
new_classes = ["GraphApiContainer"]
```

### Secrets

`DATABASE_URL` is stored as a Worker secret (not in `[vars]`). Set via:
```bash
npx wrangler secret put DATABASE_URL --env staging
```

### No PIPELINE_ORIGIN needed

The container runs the full API app directly — no pipeline proxy needed for staging.

## Owner

Dev

## Acceptance Criteria

- [ ] `wrangler.toml` has a valid `[env.staging]` with containers config
- [ ] Production config is unchanged
- [ ] `wrangler deploy --env staging --dry-run` passes validation
- [ ] `DATABASE_URL` is not in `[vars]` (it's a secret)

## Files

- `graph-server/wrangler.toml` (rewrite)
