# 00 — Expose Staging Postgres Publicly

## Problem

The staging Postgres container uses `network_mode: host` and listens on `localhost:5433`. A Cloudflare Container cannot reach `localhost` on the box — it needs a publicly routable address.

## Goal

Publish the staging Postgres port on `0.0.0.0:5433` so it's reachable at `216.38.137.154:5433` from the Cloudflare Container.

## Requirements

### docker-compose.yaml changes

- Remove `network_mode: host` from `postgres-staging`
- Remove `PGPORT: "5433"` (container listens on default 5432 internally)
- Add `ports: ["0.0.0.0:5433:5432"]`
- Add `command: ["postgres", "-c", "listen_addresses=*"]` to ensure Postgres accepts remote connections

### Recreate the container

```bash
docker compose up -d postgres-staging
```

### Verify connectivity

```bash
# STAGING_DATABASE_URL should be set in your .env (not committed)
psql "$STAGING_DATABASE_URL" -c "SELECT 1"
```

## Owner

Dev

## Acceptance Criteria

- [ ] `postgres-staging` no longer uses `network_mode: host`
- [ ] Port 5433 is published on `0.0.0.0`
- [ ] `psql` connects successfully from the box using the public IP
- [ ] Existing staging API (`:3004`) still works against the DB

## Files

- `docker-compose.yaml`
