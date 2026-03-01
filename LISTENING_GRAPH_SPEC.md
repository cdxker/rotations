# Listening History Graph — Engineering Spec

## Context

Build a **standalone project** that constructs a directed, weighted graph from a user's listening history. Nodes are songs, edges are sequential transitions (song A played before song B). The graph captures listening patterns across multiple data sources and enables analysis via PageRank.

---

## Data Sources

1. **Last.fm** — Full scrobble history via `user.getRecentTracks` (paginated, up to 200/page). Provides artist, track name, album, timestamp per scrobble. Requires only an API key.
2. **Spotify Recently Played** — Last 50 tracks via `/v1/me/player/recently-played`. Requires OAuth with `user-read-recently-played` scope.
3. **Spotify Playlists** — All user playlists and their track orderings. Requires OAuth with `playlist-read-private playlist-read-collaborative` scopes.

---

## Core Data Model

- **SongKey**: Canonical identity = `lowercase(artist) + "::" + lowercase(track_name)`. Used to match the same song across sources.
- **GraphNode**: A song with `name`, `artists`, `albumName`, optional `spotifyId`/`lastfmUrl`, weighted `next` edges (`Record<SongKey, number>`), weighted `previous` edges (`Record<SongKey, number>`), `totalPlays`, and `sources` array.
- **ListeningGraph**: `Record<SongKey, GraphNode>` + metadata (total scrobbles, date range, export timestamp, usernames).

Edges are weighted by frequency — if song A was followed by song B three times, `nodeA.next[keyB] = 3` and `nodeB.previous[keyA] = 3`.

---

## Phases

### Phase 1: Data Ingestion & Graph Construction

Build the core library and CLI/script that:
- Connects to Last.fm API and paginates through full scrobble history
- Connects to Spotify API for recently played tracks
- Fetches all Spotify playlists and their track orderings
- Normalizes tracks into `SongKey` identifiers to match across sources
- Constructs the graph: chronologically ordered scrobbles create `next`/`previous` edges; playlist track ordering adds additional edges
- Merges data from all sources into a single unified graph
- Exports the graph as a JSON file

### Phase 2: Analysis — PageRank & Stats

- Implement PageRank on the directed listening graph (songs frequently transitioned to from many sources rank higher)
- Compute summary statistics: most connected songs, highest in-degree/out-degree, clusters of tightly connected tracks
- Export enriched graph with PageRank scores per node

### Phase 3: Visualization

- Interactive graph visualization (hand off to another agent)
- Visual exploration of clusters, top-ranked songs, transition paths
- Specifics TBD after Phase 1 & 2 are complete

---

## Project Structure

New standalone project at the repo root (sibling to `site/`). Tech stack TBD — likely TypeScript/Node since the rest of the repo uses it, but open to whatever makes sense for a data pipeline + eventual visualization.

---

## Key Considerations

- Last.fm history can be 100k+ scrobbles — need to handle pagination with rate limiting (~1 req/sec to stay safe, 5/sec max)
- Song matching across sources is imperfect (slight name differences between Spotify and Last.fm). The `artist::track` normalization handles most cases; fuzzy matching could be a Phase 2 enhancement.
- Multiple edges per song are desired — the more pointers the better. Every source (listening history, playlist order) contributes additional edges.
