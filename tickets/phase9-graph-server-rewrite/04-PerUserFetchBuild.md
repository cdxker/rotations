# 04 — Per-user fetch and build pipeline

## Summary

Add a `users` table to the database. Make all pipeline endpoints per-user via a required `{ username }` body parameter. Drop all Spotify support.

## Owner

Dev

## Dependencies

- `03-VerifyAndReindex.md`

## Changes

### `database.ts` — schema

Add a `users` table:

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add `user_id INTEGER NOT NULL` column (FK to `users.id`) to:
- `nodes` — composite primary key becomes `(user_id, song_key)`
- `edges` — composite primary key becomes `(user_id, from_key, to_key)`
- `metadata` — composite primary key becomes `(user_id, key)`

Drop and recreate tables (not live, no migration needed).

Update `saveGraph()` to accept a `userId` and write it on every row.
Update `loadGraph()` to accept a `userId` and filter by it.
Update `clearGraph()` to accept a `userId` and only clear that user's data.
Add `getOrCreateUser(username: string): number` — returns the user's id, creating the row if it doesn't exist.

### `lastfm-client.ts`

- Allow constructing with just an API key + username (no env dependency)
- Constructor takes `{ apiKey: string; username: string }` directly

### `lastfm-fetcher.ts`

- Accept username as parameter to determine filenames
- Output file becomes `lastfm-scrobbles-{username}.json`
- Checkpoint file becomes `lastfm-checkpoint-{username}.json`

### `app.ts` — `POST /pipeline/fetch/lastfm`

- Parse `{ username: string }` from request body (required, 400 if missing)
- `getOrCreateUser(username)` to get the `user_id`
- Create a `LastfmClient` with the API key from env + the provided username
- Fetch scrobbles to `data/lastfm-scrobbles-{username}.json`
- This endpoint only fetches — does NOT build the graph

### `app.ts` — `POST /pipeline/build`

- Accept `{ username: string }` body (required, 400 if missing)
- Look up `user_id` from `users` table (404 if not found)
- Read scrobble data from `data/lastfm-scrobbles-{username}.json`
- Build graph, enrich, clear that user's old graph, save to DB with `user_id`

### `app.ts` — `POST /pipeline/run`

- Accept `{ username: string }` body (required, 400 if missing)
- Full pipeline for a single user: fetch → build → enrich → save

### Drop Spotify support

Delete from `app.ts`:
- `POST /pipeline/spotify/auth`
- `GET /pipeline/spotify/login`
- `GET /pipeline/spotify/callback`
- `POST /pipeline/fetch/spotify`
- All Spotify imports (`SpotifyAuth`, `SpotifyClient`)
- Spotify logic in `/pipeline/build` and `/pipeline/run`

Delete files:
- `src/ingestion/spotify-auth.ts`
- `src/ingestion/spotify-client.ts`

Remove from `build-graph.ts`:
- `spotifyRecentTracks` and `spotifyPlaylistTracks` input fields
- `spotify-recent` and `spotify-playlist` source processing

Remove `spotifyUsername` from `GraphMetadata` and metadata save/load.

### `reindex.sh`

- Accept username as script arg or from env (`LASTFM_USERNAME`)
- Pass `{ "username": "..." }` in request body to pipeline endpoints

## Acceptance Criteria

- [ ] `users` table exists with `id`, `username`, `created_at`
- [ ] `nodes`, `edges`, `metadata` tables have `user_id` FK
- [ ] `POST /pipeline/fetch/lastfm` with `{ "username": "foo" }` fetches scrobbles only
- [ ] `POST /pipeline/build` with `{ "username": "foo" }` builds and saves graph for that user
- [ ] `POST /pipeline/run` with `{ "username": "foo" }` does fetch → build → save
- [ ] Scrobble files are per-user: `lastfm-scrobbles-{username}.json`
- [ ] Graph data stored in DB is keyed by `user_id`
- [ ] `clearGraph(userId)` only clears that user's data
- [ ] All Spotify code removed (auth, client, endpoints, build-graph sources)
- [ ] `reindex.sh` passes username to endpoints
- [ ] Existing tests updated to pass `user_id` and remove Spotify references
