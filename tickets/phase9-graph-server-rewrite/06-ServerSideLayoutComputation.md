# 06 — Compute graph layout positions on the server

## Summary

Move the heavy layout calculations (MDS, weighted-MDS, PageRank-radial) from the frontend to the backend. Compute positions during the build pipeline (after `enrichGraph`) and store them in the database. The frontend reads pre-computed positions instead of calculating them on every page load.

## Owner

Dev

## Dependencies

- `03-VerifyAndReindex.md`

## Context

The frontend currently runs three layout algorithms in `graph-frontend/src/graph-utils/`:
- **`mds.ts`** — Classical MDS on all-pairs shortest-path hop distances. O(n^2) BFS + O(n^2) matrix ops.
- **`weighted-mds.ts`** — Weighted MDS using 1/weight as edge distance with all-pairs Dijkstra. O(n^2) Dijkstra + MDS + overlap spreading.
- **`pageRank.ts`** — Radial layout placing high-PageRank nodes near center. O(n) — lightweight but might as well precompute.

These run in the browser on every page load / layout switch. For large graphs this blocks the UI.

## Changes

### New file: `graph-server/src/analysis/layout.ts`
- Port the three layout functions from `graph-frontend/src/graph-utils/` (mds, weighted-mds, pagerank-radial)
- Adapt to work with `ListeningGraph` / `GraphNode` types instead of graphology
- Each returns `Record<SongKey, { x: number; y: number }>`

### `graph-server/src/graph/types.ts` — `GraphNode`
- Add `positions?: { pagerank?: { x: number; y: number }; mds?: { x: number; y: number }; "weighted-mds"?: { x: number; y: number } }`

### `graph-server/src/graph/database.ts`
- Add `positions TEXT` column to nodes table (JSON blob of all layout positions)
- Save/load positions

### `graph-server/src/server/app.ts` — build pipeline
- After `enrichGraph(graph)`, call the layout functions
- Attach positions to each node before saving to DB

### `graph-server/src/server/app.ts` — `GET /graph`
- Positions are already on each node, returned with the graph data

### `graph-frontend/src/graph-utils/setNodePositions.ts`
- Read positions from the node data returned by the API
- Fall back to client-side calculation if positions are missing (backwards compat)

## Acceptance Criteria

- [ ] Layout functions ported to `graph-server/src/analysis/layout.ts`
- [ ] Positions computed during build and stored in DB
- [ ] `GET /graph` returns nodes with `positions` field
- [ ] Frontend reads pre-computed positions from API response
- [ ] Frontend falls back to client-side calculation if `positions` is missing
- [ ] All three layout modes work: pagerank, mds, weighted-mds
