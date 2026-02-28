# 04 — Hook Up Export to Database

## Summary

Persist the constructed `ListeningGraph` into the chosen database.

## Owner

Dev

## Dependencies

- `02-DataStorage.md` (need to know which DB)
- `04-BuildGraph.md` (need the graph to insert)

## Acceptance Criteria

- [ ] Design the DB schema based on the `ListeningGraph` types and the chosen database
- [ ] Implement schema migrations / table creation
- [ ] Write insert/upsert logic for nodes and edges
- [ ] Support incremental updates — inserting new data should merge with existing (sum edge weights, update play counts)
- [ ] Verify round-trip: insert graph → read it back → matches original
- [ ] Handle large graphs efficiently (100k+ nodes possible)

## Notes

- The specific implementation depends entirely on which DB is chosen in `02-DataStorage.md`.
- The server (`05-CreateServer.md`) will read from this database.

## Progress

- [X] DB schema: `nodes`, `edges`, `metadata` tables with indexed FKs
- [X] Schema auto-creation in constructor via `CREATE TABLE IF NOT EXISTS`
- [X] Insert/upsert for nodes (ON CONFLICT merges play counts, sources, optional fields)
- [X] Insert/upsert for edges (ON CONFLICT sums weights)
- [X] Incremental updates tested — second save merges with existing data
- [X] Round-trip verified: save → load → matches original (6 tests)
- [X] WAL journal mode + transactions for large graph efficiency
- [X] Helper methods: getNode, getNodeCount, getEdgeCount
