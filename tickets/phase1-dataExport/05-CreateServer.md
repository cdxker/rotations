# 05 — Create Server

## Summary

Build an API server that reads from the database and serves graph data to the frontend.

## Owner

Dev

## Dependencies

- `04-HookUpExportToDatabase.md` (need data in the DB to serve)

## Acceptance Criteria

- [ ] Pick a framework (Express, Fastify, Hono, or Astro API routes in the existing `site/`)
- [ ] Minimum endpoints:
  - `GET /graph` — full graph (or paginated subset for large graphs)
  - `GET /graph/node/:songKey` — single node with its edges
  - `GET /graph/neighbors/:songKey` — immediate neighbors (next + previous)
  - `GET /graph/stats` — summary statistics (total nodes, total edges, date range, etc.)
- [ ] CORS configuration for frontend consumption
- [ ] Error handling and input validation
- [ ] Consider: should this be a standalone server, or new API routes added to the existing Astro app in `site/`?

## Notes

- If the visualization (Phase 3) will live inside the existing `site/` Astro app, it may make sense to add these as Astro API routes rather than a separate server.
- For large graphs, consider pagination or streaming responses.

## Progress

- [X] Install Hono and set up server module
- [X] Implement GET /graph (full graph or paginated)
- [X] Implement GET /graph/node/:songKey
- [X] Implement GET /graph/neighbors/:songKey
- [X] Implement GET /graph/stats
- [X] CORS, error handling, input validation
- [X] Add tests (11 tests passing)
- [X] Verify compilation (tsc --noEmit clean)

### Decisions
- Using Hono (lightweight, TS-first) as standalone server in graph-pipeline
- Standalone server keeps data layer encapsulated; frontend consumes via CORS
- DB path configurable via env var
