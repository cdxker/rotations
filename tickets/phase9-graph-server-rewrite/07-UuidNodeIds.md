# 07 — Add mbid storage + UUID node IDs for compact API response

## Summary

Store `mbid` (MusicBrainz ID) from Last.fm when available. Add UUID `id` to nodes in the DB. API responses use UUIDs for node keys and next/prev references — smaller payload, no sequential leaking. Internal analysis code (enrich, pagerank, clusters, paths) stays unchanged — still uses SongKey.

## Owner

Dev

## Dependencies

- `06-ServerSideLayoutComputation.md`

## Context

The `GET /graph` API response is bloated because `next` and `previous` on every node use full `SongKey` strings (`"artist::track"`) as keys. These strings are repeated thousands of times across the response. Additionally, Last.fm returns `mbid` (MusicBrainz ID) on tracks but we're not capturing it.

## Changes

### `graph-server/src/ingestion/lastfm-fetcher.ts`
- Add `mbid?: string` to `LastfmApiTrack` interface
- In `parseTrack()`: capture `track.mbid` when non-empty string, add to returned `RawScrobble`

### `graph-server/src/graph/build-graph.ts`
- Add `mbid?: string` to `RawScrobble` interface
- In `getOrCreateNode()`: set `node.mbid = scrobble.mbid` (first non-empty wins)

### `graph-server/src/graph/types.ts`
- Add `mbid?: string` to `GraphNode` interface
- Add `CompactGraphNode` interface (UUID-keyed next/prev, includes `songKey`)
- Add `CompactGraph` interface (`Record<string, CompactGraphNode>` nodes + metadata)

### `graph-server/src/graph/database.ts`
- Add `id TEXT NOT NULL` and `mbid TEXT` columns to nodes table, `id` as PRIMARY KEY
- Change edges to use `from_id`/`to_id` (UUIDs) instead of `from_key`/`to_key`
- `saveGraph()`: generate UUIDs via `crypto.randomUUID()`, build songKey→UUID map, insert edges with UUIDs
- `loadGraph()`: returns `ListeningGraph` (SongKey-based, unchanged) — translates UUIDs back to SongKeys
- New `loadGraphCompact()`: returns `CompactGraph` with UUID-keyed nodes and next/prev
- `getNode()`: add overload accepting UUID `id`
- New `getNodeById()`: lookup by UUID

### `graph-server/src/server/app.ts`
- `GET /graph` — call `db.loadGraphCompact(userId)` instead of `db.loadGraph(userId)`
- `GET /graph/node/:id` — accept UUID param, return compact node
- `GET /graph/neighbors/:id` — accept UUID, return neighbors with UUIDs
- `GET /graph/path` — `?from=` and `?to=` accept UUIDs
- `GET /graph/stats` — unchanged
- `GET /graph/analysis` — uses `loadGraph()` internally (SongKey-based)

### `graph-frontend/src/lib/types.ts`
- Update `GraphNode` to match `CompactGraphNode` (add `songKey`, `mbid`, change next/prev to UUID keys)
- Update `ListeningGraph.nodes` to `Record<string, GraphNode>` (UUID keys)

### `graph-frontend/src/contexts/graphContext.tsx`
- `toGraphology()`: use UUID as graphology node key, update edge iteration

### Tests
- `database.test.ts` — test `loadGraphCompact`, UUID-based edges
- `lastfm-fetcher.test.ts` — verify mbid captured
- `build-graph.test.ts` — verify mbid passed through
- `app.test.ts` — verify compact response shape (UUID keys, no SongKey keys)

## Acceptance Criteria

- [ ] `mbid` captured from Last.fm API when available
- [ ] Nodes stored with UUID `id` in database
- [ ] `GET /graph` returns UUID-keyed nodes with compact next/prev
- [ ] Internal analysis code unchanged (uses SongKey via `loadGraph()`)
- [ ] Frontend loads and renders graph with UUID-keyed data
- [ ] All tests pass, `tsc --noEmit` clean
