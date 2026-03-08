# Graph Server

A data pipeline and API server that builds a directed, weighted listening graph from Last.fm history.
Nodes are songs, edges are sequential transitions, and every user has isolated graph data.

## Changes In Active PR (#68)

- Ticket 04: per-user pipeline and storage isolation (`users` table + user-scoped graph data)
- Ticket 05: all `GET` graph endpoints require `?user=<username>` (`400` if missing, `404` if unknown)
- Ticket 06: layout computation moved server-side (PageRank radial, MDS, weighted MDS), stored in DB as `positions`
- `/pipeline/run` is now async queue-based and returns `202` + `jobId`
- `/pipeline/run/:jobId` and `/pipeline/run?username=...` provide status/timestamp polling
- Persistence migrated to Postgres (`pg`), SQLite removed
- Spotify support removed from graph-server pipeline flow

## How It Works

1. Fetch scrobbles from Last.fm for a username
2. Normalize tracks into canonical `SongKey` (`lowercase(artist)::lowercase(track)`)
3. Build weighted transition graph
4. Enrich graph (PageRank, clusters, summary stats)
5. Compute and attach node layout positions
6. Persist per-user graph data in Postgres (`users`, `nodes`, `edges`, `metadata`, `pipeline_jobs`)

## Prerequisites

- Node.js >= 20
- pnpm
- Docker (for local Postgres via `docker compose`)
- Last.fm API key: https://www.last.fm/api/account/create

## Setup

From repo root:

```bash
pnpm install
docker compose up -d
```

In `graph-server`:

```bash
cd graph-server
cp .env.example .env
```

Set env values:

```env
LASTFM_API_KEY=your_api_key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/graph
GRAPH_SERVER_PORT=3001
```

## Usage

### Start server

```bash
cd graph-server
pnpm dev
```

### Run full pipeline

```bash
./reindex.sh <username>
```

Or queue directly:

```bash
curl -X POST http://localhost:3001/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"username":"your_lastfm_username"}'
```

## API Endpoints

All `GET` endpoints below require `?user=<username>` unless noted.

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/graph` | Full compact graph (UUID-keyed nodes). Optional `?limit=&offset=` pagination. |
| `GET` | `/graph/node/:id` | Single node by UUID. |
| `GET` | `/graph/neighbors/:id` | Node plus immediate neighbors by UUID. |
| `GET` | `/graph/stats` | Summary counts + metadata. |
| `GET` | `/graph/analysis` | Enrichment summary. Optional `?topN=`. |
| `GET` | `/graph/path` | Path query. `from`/`to` accept UUIDs (preferred) or SongKeys; `algorithm=shortest|strongest`. |
| `POST` | `/pipeline/fetch/lastfm` | Fetch scrobbles for `{ "username": "..." }`. |
| `POST` | `/pipeline/build` | Build from fetched data for `{ "username": "..." }`. |
| `POST` | `/pipeline/run` | Queue full pipeline for `{ "username": "..." }`, returns `202` + `jobId`. |
| `GET` | `/pipeline/run/:jobId` | Job status (`queued`, `running`, `succeeded`, `failed`, `cancelled`) + timestamps. |
| `GET` | `/pipeline/run?username=...` | List job statuses/timestamps for a username. |

## Scripts

```bash
pnpm build
pnpm dev
pnpm test
pnpm lint
```

## Troubleshooting

- Last.fm rate limiting: fetcher currently sleeps between requests; tune in `lastfm-fetcher.ts` if needed.
- Last.fm fetch resume: checkpointed fetch can resume after interruption.
- `LASTFM_API_KEY is not set`: confirm `graph-server/.env` exists.
- Postgres not reachable: run `docker compose up -d` and confirm `DATABASE_URL`.
