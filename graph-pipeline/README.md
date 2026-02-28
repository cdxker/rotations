# Graph Pipeline

A data pipeline that constructs a directed, weighted graph from your listening history. Nodes are songs, edges are sequential transitions (song A played before song B), and edge weights represent how many times a transition occurred. The graph captures listening patterns across Last.fm and Spotify.

## How It Works

1. **Fetch** scrobble history from Last.fm and recently played / playlist data from Spotify
2. **Normalize** tracks into canonical `SongKey` identifiers (`lowercase(artist)::lowercase(track)`) to match the same song across sources
3. **Build** the graph: consecutive plays create weighted edges; playlist orderings add additional edges
4. **Store** the unified graph in a SQLite database

## Prerequisites

- **Node.js** >= 20
- **npm**
- **Last.fm API key** — [create one here](https://www.last.fm/api/account/create)
- **Spotify Developer App** — [create one here](https://developer.spotify.com/dashboard), set the redirect URI to `http://localhost:8888/callback`

## Setup

```bash
cd graph-pipeline
npm install
```

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Last.fm
LASTFM_API_KEY=your_api_key
LASTFM_USERNAME=your_lastfm_username

# Spotify
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_PORT=8888
```

## Usage

The pipeline is used programmatically via TypeScript imports. Below are the key steps.

### 1. Authenticate

**Last.fm** — authentication is automatic. The `LastfmClient` reads `LASTFM_API_KEY` from `.env` and includes it as a query parameter on every request. No OAuth flow needed.

```typescript
import { LastfmClient } from "./src/ingestion/lastfm-client.js";

const client = new LastfmClient();
const userInfo = await client.verifyAuth(); // Validates API key + username
```

**Spotify** — requires a one-time OAuth flow. Run `authorize()` to open a browser, log in, and save tokens to disk. Subsequent runs load tokens automatically and refresh them when expired.

```typescript
import { SpotifyAuth } from "./src/ingestion/spotify-auth.js";

const auth = new SpotifyAuth();
await auth.authorize(); // Opens browser, waits for callback
// Tokens are saved to .spotify-tokens.json
```

### 2. Fetch Data

**Last.fm scrobbles** — paginates through your full history (200 tracks/page, ~1 request/second). Supports resuming from a checkpoint if interrupted.

```typescript
import { fetchLastfmScrobbles } from "./src/ingestion/lastfm-fetcher.js";

const scrobbles = await fetchLastfmScrobbles(client);
// Saves to data/lastfm-scrobbles.json with checkpoint support
```

Options:
- `fullRefresh: true` — ignore checkpoint, re-fetch everything
- `onProgress: (msg) => ...` — custom progress callback
- `dataDir: "/custom/path"` — override output directory

**Spotify data** — fetches recently played tracks (max 50) and all playlist track orderings.

```typescript
import { SpotifyClient } from "./src/ingestion/spotify-client.js";

const spotify = new SpotifyClient(auth);
const dump = await spotify.fetchAll();
// Or export directly:
await spotify.exportToJson("data/spotify-dump.json");
```

### 3. Build the Graph

Combine raw data from any/all sources into a unified `ListeningGraph`:

```typescript
import { buildGraph } from "./src/graph/build-graph.js";

const graph = buildGraph({
  lastfmScrobbles: scrobbles,
  spotifyRecentTracks: dump.recentlyPlayed,
  spotifyPlaylistTracks: dump.playlistTracks,
  lastfmUsername: "your_username",
  spotifyUsername: "your_display_name",
});
```

All input fields are optional — build with whatever sources you have. The same song appearing in multiple sources is merged into a single node (matched by `SongKey`), with edge weights summed and sources unioned.

### 4. Store in Database

Persist the graph to SQLite for querying:

```typescript
import { GraphDatabase } from "./src/graph/database.js";

const db = new GraphDatabase("data/listening-graph.db");
db.saveGraph(graph);

// Query later:
const loaded = db.loadGraph();
const node = db.getNode("artist::track" as SongKey);
console.log(`${db.getNodeCount()} nodes, ${db.getEdgeCount()} edges`);

db.close();
```

The database supports incremental updates — calling `saveGraph()` again merges edge weights and play counts with existing data.

### 5. Serve the API

Start the API server to query the graph over HTTP:

```bash
npm run serve
```

The server reads `GRAPH_SERVER_PORT` (default: `3001`) and `GRAPH_DB_PATH` (default: `graph.db`) from `.env`.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/graph` | Full graph. Optional `?limit=N&offset=M` for pagination. |
| `GET` | `/graph/node/:songKey` | Single node with edges. `songKey` is URL-encoded (e.g., `artist%20a::track%201`). |
| `GET` | `/graph/neighbors/:songKey` | Node with full neighbor data (resolved nodes for each edge). |
| `GET` | `/graph/stats` | Summary: total nodes, edges, and graph metadata. |

CORS is enabled for frontend consumption.

## Scripts

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode (recompile on changes)
npm test           # Run tests (vitest)
npm run lint       # ESLint + type checking
npm run format     # Format with Prettier
npm run serve      # Start API server (Hono on Node)
```

## Project Structure

```
graph-pipeline/
├── src/
│   ├── config.ts                      # Environment config loading (Last.fm + Spotify)
│   ├── index.ts                       # Entry point
│   ├── server/
│   │   ├── app.ts                    # Hono API routes (graph, node, neighbors, stats)
│   │   └── index.ts                  # Server entry point (starts Hono on Node)
│   ├── ingestion/
│   │   ├── types.ts                   # Raw data types (RawScrobble, RawSpotifyRecentTrack, etc.)
│   │   ├── lastfm-client.ts           # Last.fm API client (auth + requests)
│   │   ├── lastfm-fetcher.ts          # Paginated scrobble fetcher with resume support
│   │   ├── spotify-auth.ts            # Spotify OAuth2 flow (browser-based)
│   │   └── spotify-client.ts          # Spotify API client (recently played + playlists)
│   └── graph/
│       ├── types.ts                   # Graph types (SongKey, GraphNode, ListeningGraph)
│       ├── build-graph.ts             # Core graph construction + cross-source merging
│       └── database.ts                # SQLite persistence (better-sqlite3)
├── data/                              # Runtime data output (gitignored)
│   ├── lastfm-scrobbles.json          # Raw Last.fm scrobble dump
│   ├── lastfm-checkpoint.json         # Resume checkpoint for Last.fm fetcher
│   └── listening-graph.db             # SQLite database
├── docs/
│   └── data-storage-decision.md       # Architecture decision: why SQLite
├── .env.example                       # Template for environment variables
├── package.json
├── tsconfig.json
└── eslint.config.js
```

## Architecture Decisions

- **SQLite** was chosen over Neo4j, PostgreSQL, and TinyBase for zero-infrastructure simplicity. See [docs/data-storage-decision.md](docs/data-storage-decision.md) for the full evaluation.
- **SongKey** (`lowercase(artist)::lowercase(track)`) is the canonical identity for cross-source matching. Exact match only — fuzzy matching is future work.
- **Hono** is used for the API server — lightweight, fast, and runs on Node via `@hono/node-server`.
- **Edge weights** are additive across sources and repeated transitions. If song A was followed by song B 3 times from Last.fm and 1 time in a Spotify playlist, the edge weight is 4.

## Troubleshooting

**Last.fm API rate limiting** — The fetcher sleeps 1 second between requests (Last.fm allows up to 5/sec). If you get 429 errors, the rate limit may have changed; increase the delay in `lastfm-fetcher.ts`.

**Last.fm fetch interrupted** — The fetcher saves a checkpoint every 10 pages. Re-run the fetch and it will resume from where it left off. Use `fullRefresh: true` to start over.

**Spotify token expired** — Tokens are automatically refreshed. If refresh fails (e.g., app credentials changed), delete `.spotify-tokens.json` and re-run `authorize()`.

**Spotify 429 rate limiting** — The Spotify client retries up to 3 times with the `Retry-After` header. If you still hit limits, space out your requests.

**"LASTFM_API_KEY is not set"** — Make sure `.env` exists in the `graph-pipeline/` directory with your API key. Check that `dotenv` is installed (`npm install`).

**"No Spotify tokens found"** — You need to run the OAuth flow first with `auth.authorize()`. This opens a browser window for you to log in to Spotify.

**Large scrobble history** — A user with 100k+ scrobbles will take ~8+ minutes to fetch (200/page at 1 req/sec). Progress is logged to the console. The checkpoint system means you don't have to finish in one session.
