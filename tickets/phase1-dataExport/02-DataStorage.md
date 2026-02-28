# 02 — Data Storage

## Summary

Research and select a database for persisting the listening graph long-term. Produce a decision document.

## Owner

Dev

## Dependencies

- `01-DefineGraphSchema.md` (need to know what we're storing)

## Parallelizable With

- `02-CreateSpotifyDeveloperApp.md`
- `02-CreateLastFMAPIAccount.md`
- `02-ImplementSpotifyOAuth.md`
- `02-ImplementLastFMAuth.md`

## Acceptance Criteria

- [ ] Evaluate at minimum:
  - **Neo4j** — native graph DB, natural fit for graph queries, heavier infrastructure
  - **SQLite** — simple, file-based, good enough for single-user, no server needed
  - **PostgreSQL** — robust, supports JSON columns, could model edges as rows
  - **TinyBase** — already used in `site/` for client-side state, could it work for the pipeline too?
- [ ] Decision document with pros/cons for each option
- [ ] Consider: query patterns (neighbors, paths, PageRank traversal), data size (100k+ scrobbles), deployment simplicity, compatibility with the existing Astro/Node stack
- [ ] Final recommendation with rationale

## Notes

- The graph will be queried by the Phase 1 server (`05-CreateServer.md`) and consumed by Phase 3 visualization.
- Keep it simple — this is a personal project, not a production system. Don't over-engineer.

## Progress

- [X] Evaluated Neo4j, SQLite, PostgreSQL, TinyBase
- [X] Decision document at `graph-pipeline/docs/data-storage-decision.md`
- [X] Considered query patterns, data size, deployment simplicity, stack compatibility
- [X] Final recommendation: **SQLite via `better-sqlite3`**

### Decision Summary
SQLite — zero infrastructure, right-sized for 100k scrobbles, portable `.db` file, no server needed. Edges in a dedicated table with indexed foreign keys for efficient neighbor lookups. PageRank computed in-memory.
