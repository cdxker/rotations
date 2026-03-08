# Graph Server

A data pipeline and API server that constructs a directed, weighted graph from your Last.fm listening history. Nodes are songs, edges are sequential transitions (song A played before song B), and edge weights represent how many times a transition occurred. Supports multiple users — each gets their own isolated graph.

## How It Works

1. **Fetch** scrobble history from Last.fm (per user)
2. **Normalize** tracks into canonical `SongKey` identifiers (`lowercase(artist)::lowercase(track)`)
3. **Build** the graph: consecutive plays create weighted edges
4. **Enrich** with PageRank scores, cluster assignments, and statistics
5. **Store** the graph in a per-user SQLite database

## Prerequisites

- **Node.js** >= 20
- **pnpm**
- **Last.fm API key** — [create one here](https://www.last.fm/api/account/create)

## Setup

```bash
cd graph-server
pnpm install
```

Copy the example environment file and fill in your API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
LASTFM_API_KEY=your_api_key
```

## Usage

### Start the server

```bash
pnpm dev
```

The server reads `GRAPH_SERVER_PORT` (default: `3001`) and `DATABASE_URL` from `.env`.

### Run the pipeline

```bash
# Fetch + build for a user
./reindex.sh <username>

# Or via API:
curl -X POST http://localhost:3001/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"username": "your_lastfm_username"}'
```

### API Endpoints

All GET endpoints require `?user=<username>`.

| Method | Path                        | Description                                                                       |
| ------ | --------------------------- | --------------------------------------------------------------------------------- |
| `GET`  | `/graph`                    | Full graph. Optional `?limit=N&offset=M` for pagination.                          |
| `GET`  | `/graph/node/:songKey`      | Single node with edges. `songKey` is URL-encoded (e.g., `artist%20a::track%201`). |
| `GET`  | `/graph/neighbors/:songKey` | Node with full neighbor data (resolved nodes for each edge).                      |
| `GET`  | `/graph/stats`              | Summary: total nodes, edges, and graph metadata.                                  |
| `GET`  | `/graph/analysis`           | Full analysis: PageRank, clusters, rankings. Optional `?topN=N`.                  |
| `GET`  | `/graph/path`               | Find path between two songs. `?from=&to=&algorithm=shortest\|strongest`.          |
| `POST` | `/pipeline/fetch/lastfm`    | Fetch scrobbles. Body: `{"username": "..."}`.                                     |
| `POST` | `/pipeline/build`           | Build graph from fetched data. Body: `{"username": "..."}`.                       |
| `POST` | `/pipeline/run`             | Queue full pipeline job. Body: `{"username": "..."}`. Returns `202` + `jobId`.     |
| `GET`  | `/pipeline/run/:jobId`      | Get job status (`queued`, `running`, `succeeded`, `failed`, `cancelled`).           |
| `GET`  | `/pipeline/run?username=...`| List queued/running/completed jobs for a user (status + timestamps only).           |

CORS is enabled for frontend consumption.

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm dev        # Start dev server (tsx)
pnpm test       # Run tests (vitest)
```

## Troubleshooting

**Last.fm API rate limiting** — The fetcher sleeps 1 second between requests. If you get 429 errors, increase the delay in `lastfm-fetcher.ts`.

**Last.fm fetch interrupted** — The fetcher saves a checkpoint every 10 pages. Re-run the fetch and it will resume from where it left off. Use `fullRefresh: true` to start over.

**"LASTFM_API_KEY is not set"** — Make sure `.env` exists with your API key.

**Large scrobble history** — A user with 100k+ scrobbles will take ~8+ minutes to fetch (200/page at 1 req/sec). The checkpoint system means you don't have to finish in one session.
