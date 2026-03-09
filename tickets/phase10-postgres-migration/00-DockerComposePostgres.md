# 00 — Docker Compose for local Postgres

## Summary

Add a `docker-compose.yaml` to the repo root with a Postgres service for local development.

## Owner

Dev

## Dependencies

None

## Changes

### `docker-compose.yaml` (repo root)

- Postgres 16 service
- Exposed on port `5432`
- Default credentials: `postgres` / `postgres`, database `graph`
- Named volume for data persistence

### `.env.example` (graph-server)

- Add `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/graph`

## Acceptance Criteria

- [ ] `docker compose up -d` starts Postgres
- [ ] Can connect to `localhost:5432` with the default credentials
- [ ] `.env.example` has `DATABASE_URL`
