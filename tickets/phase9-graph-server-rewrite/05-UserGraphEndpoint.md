# 05 — GET /graph requires user parameter

## Summary

Update `GET /graph` to require a `?user=username` query parameter. Look up the user in the `users` table, load their graph from the DB, and return it. No user = 400 error.

## Owner

Dev

## Dependencies

- `04-PerUserFetchBuild.md`

## Changes

### `app.ts` — `GET /graph`

- Read `?user=username` query param (required — return 400 if missing)
- Look up `user_id` from `users` table (return 404 if user not found)
- Call `db.loadGraph(userId)` to get only that user's nodes/edges/metadata
- Return the graph with same response shape
- Pagination still works, scoped to that user's nodes

### `app.ts` — `GET /graph/node/:songKey`

- Also require `?user=username`, scope lookup to that user's data

### `app.ts` — `GET /graph/neighbors/:songKey`

- Also require `?user=username`, scope lookup to that user's data

### `app.ts` — `GET /graph/stats`

- Also require `?user=username`, return stats for that user only

### `app.ts` — `GET /graph/analysis`

- Also require `?user=username`, run analysis on that user's graph

### `app.ts` — `GET /graph/path`

- Also require `?user=username`, find path within that user's graph

## Acceptance Criteria

- [ ] `GET /graph?user=username` returns only that user's graph
- [ ] `GET /graph` with no `user` param returns 400
- [ ] `GET /graph?user=unknown` returns 404
- [ ] All graph read endpoints (`/graph/node`, `/graph/neighbors`, `/graph/stats`, `/graph/analysis`, `/graph/path`) require `?user=` and scope to that user
- [ ] Pagination still works within a user's graph
