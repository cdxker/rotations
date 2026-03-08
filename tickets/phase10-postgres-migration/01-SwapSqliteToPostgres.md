# 01 — Swap better-sqlite3 for Postgres

## Summary

Replace `better-sqlite3` with a Postgres driver (`pg` or `postgres`) in `graph-server`. Migrate all schema and queries from SQLite syntax to Postgres syntax.

## Owner

Dev

## Dependencies

- `00-DockerComposePostgres.md`

## Changes

### Dependencies

- Remove `better-sqlite3` and `@types/better-sqlite3`
- Add `pg` + `@types/pg` (or `postgres` — whichever is picked)

### `src/graph/database.ts` — schema

Translate all `CREATE TABLE` statements from SQLite to Postgres:

- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY` (or `GENERATED ALWAYS AS IDENTITY`)
- `DEFAULT (datetime('now'))` → `DEFAULT now()`
- `TEXT` columns storing JSON → consider `JSONB` where appropriate (`sources`, `source_plays`, `play_dates`, `positions`)
- Remove SQLite pragmas (`journal_mode = WAL`, `foreign_keys = ON`) — Postgres enforces FKs by default

### `src/graph/database.ts` — connection

- Replace `new Database(dbPath)` with a Postgres connection pool using `DATABASE_URL` from env
- Constructor becomes async (or use a static factory method)

### `src/graph/database.ts` — queries

Translate all queries:

- Replace `?` positional params with `$1, $2, ...` numbered params (if using `pg`)
- Replace `@namedParam` binding with positional params
- `db.prepare().get()` → `pool.query()` returning `rows[0]`
- `db.prepare().all()` → `pool.query()` returning `rows`
- `db.prepare().run()` → `pool.query()` (check `rowCount` if needed)
- `db.transaction(() => { ... })` → `BEGIN / COMMIT / ROLLBACK` via a client checkout
- `result.lastInsertRowid` → use `RETURNING id` clause
- `ON CONFLICT ... DO UPDATE SET` syntax is the same in Postgres
- `excluded.*` references work the same in Postgres

### `src/graph/database.ts` — JSON fields

- If switching to `JSONB`: use `::jsonb` casts on insert, parse on read
- `JSON.parse()` / `JSON.stringify()` calls may be removable if using JSONB (driver handles it)

### `src/server/index.ts`

- Replace `GRAPH_DB_PATH` env var with `DATABASE_URL`
- Pass connection string to `GraphDatabase` constructor

### Tests

- Update all database tests to use Postgres (connect to the docker-compose instance or use a test database)
- May need a `beforeAll` that creates/resets a test schema

## Acceptance Criteria

- [ ] `better-sqlite3` fully removed from `package.json`
- [ ] `GraphDatabase` connects to Postgres via `DATABASE_URL`
- [ ] All tables created in Postgres on startup
- [ ] `saveGraph()`, `loadGraph()`, `loadGraphCompact()` work against Postgres
- [ ] `getOrCreateUser()`, `getUserId()` work against Postgres
- [ ] `clearGraph()` works against Postgres
- [ ] `getNodeByKey()`, `getNodeById()`, `getNodeCount()`, `getEdgeCount()` work against Postgres
- [ ] Transactions are used for atomic graph saves
- [ ] All existing tests pass against Postgres
- [ ] `docker compose up -d && pnpm dev` starts the server successfully
