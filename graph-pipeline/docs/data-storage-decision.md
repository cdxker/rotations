# Data Storage Decision

## Context

We need a database to persist the listening graph long-term. The graph will contain 100k+ scrobbles resulting in tens of thousands of nodes with weighted edges. It will be queried by the Phase 1 API server and consumed by Phase 3 visualization.

Query patterns: neighbor lookups, path traversal, PageRank iteration, full graph export for visualization.

## Options Evaluated

### 1. SQLite

| Aspect | Assessment |
|---|---|
| **Fit** | Excellent for single-user, file-based, zero-config |
| **Query patterns** | Neighbor lookups via indexed foreign keys. Path traversal with recursive CTEs. PageRank requires iterative queries or in-memory computation. Full export is a simple scan. |
| **Data size** | Handles millions of rows easily. 100k scrobbles / ~30k nodes is trivial. |
| **Deployment** | Zero infrastructure — just a `.db` file. Works everywhere Node runs. |
| **Node ecosystem** | `better-sqlite3` is mature, synchronous (fast), well-maintained. |
| **Schema** | `nodes` table + `edges` table, or `nodes` table with JSON columns for edges. Flexible. |
| **Downsides** | Graph traversal queries are verbose compared to a graph DB. No built-in graph algorithms. |

### 2. Neo4j

| Aspect | Assessment |
|---|---|
| **Fit** | Native graph DB — most natural for graph queries (Cypher language) |
| **Query patterns** | Neighbor lookups, path finding, traversal are all first-class. PageRank available as a built-in plugin (GDS library). |
| **Data size** | Overkill capacity for our scale. |
| **Deployment** | Requires running a separate server (Docker or installed). Significant infrastructure overhead for a personal project. |
| **Node ecosystem** | Official `neo4j-driver` package. Works but adds connection management complexity. |
| **Downsides** | Heavy infrastructure for a single-user project. Learning Cypher adds cognitive overhead. Docker dependency for dev/deploy. |

### 3. PostgreSQL

| Aspect | Assessment |
|---|---|
| **Fit** | Robust, supports JSON columns, good at relational + semi-structured data |
| **Query patterns** | Similar to SQLite but with richer JSON operators. Recursive CTEs for paths. No built-in graph algorithms. |
| **Data size** | Way beyond our needs. |
| **Deployment** | Requires a running server. Docker or hosted service. |
| **Node ecosystem** | `pg` or `postgres.js` — mature options. |
| **Downsides** | Server dependency is unnecessary overhead for a personal, single-user project. No advantages over SQLite at this scale. |

### 4. TinyBase

| Aspect | Assessment |
|---|---|
| **Fit** | Already used in `site/` for client-side state (localStorage-backed) |
| **Query patterns** | Key-value / row-based lookups. No SQL, no joins, no recursive queries. |
| **Data size** | Designed for client-side state, not 100k+ row datasets. No indexing beyond row IDs. |
| **Deployment** | Zero-config, file or localStorage persister available. |
| **Node ecosystem** | Has a `persister-file` module for Node, so it *can* work server-side. |
| **Downsides** | No query language — all traversal would be manual iteration in JS. Performance degrades with large datasets. Scanning all rows to find neighbors is O(n). Not designed for this use case. |

## Recommendation: SQLite (via `better-sqlite3`)

**Rationale:**

1. **Zero infrastructure** — no server to run, just a `.db` file. Matches the "keep it simple" principle.
2. **Right-sized** — handles our data volume trivially without being overkill.
3. **Good enough for graph queries** — neighbor lookups are fast with indexed foreign keys. PageRank will be computed in-memory anyway (iterative algorithm over the full graph), so the DB just needs to load/save the graph efficiently.
4. **Full graph export is trivial** — Phase 3 visualization needs the whole graph as JSON; a simple `SELECT *` from nodes + edges does it.
5. **Portable** — the `.db` file can be committed, backed up, or moved easily.
6. **No new infrastructure** — unlike Neo4j/Postgres, no Docker containers or running services needed.

**Schema sketch:**

```sql
CREATE TABLE nodes (
    song_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    artists TEXT NOT NULL,        -- JSON array
    album_name TEXT,
    spotify_id TEXT,
    lastfm_url TEXT,
    track_id TEXT,
    total_plays INTEGER NOT NULL DEFAULT 0,
    sources TEXT NOT NULL          -- JSON array
);

CREATE TABLE edges (
    from_key TEXT NOT NULL REFERENCES nodes(song_key),
    to_key TEXT NOT NULL REFERENCES nodes(song_key),
    weight INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (from_key, to_key)
);

CREATE INDEX idx_edges_from ON edges(from_key);
CREATE INDEX idx_edges_to ON edges(to_key);
```

This separates `next`/`previous` edges into a dedicated table (instead of JSON blobs on the node), making neighbor queries efficient: `SELECT * FROM edges WHERE from_key = ?` for outgoing, `SELECT * FROM edges WHERE to_key = ?` for incoming.
