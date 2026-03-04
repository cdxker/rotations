# Phase 9 — Graph Server Rewrite

## Context

The `graph-pipeline/` Spotify auth and client code was AI-generated and has bad patterns: over-abstracted classes, excessive docstrings, unnecessary private method indirection (`tokenRequest()`, `waitForCallback()`, `openBrowser()`), and too many intermediate interfaces. We're copying the directory to `graph-server/` and rewriting the Spotify files from scratch with clean, flat, inline code.

The site API routes (`site/src/pages/api/spotify/*`) are the correct implementation and stay untouched.

## Files to rewrite

- `graph-server/src/ingestion/spotify-auth.ts` — OAuth flow, token storage
- `graph-server/src/ingestion/spotify-client.ts` — API client for fetching data

## Files that consume these (must keep working)

- `graph-server/src/server/app.ts` — uses `SpotifyAuth` and `SpotifyClient` in pipeline routes
- `tests/graph-pipeline/ingestion/spotify-auth.test.ts` — 10 tests
- `tests/graph-pipeline/ingestion/spotify-client.test.ts` — 8 tests

## Tickets

### 00 — Copy graph-pipeline to graph-server

Copy the entire `graph-pipeline/` directory to `graph-server/`. Verify `pnpm install` and `pnpm test` work in the new directory. Update test import paths from `graph-pipeline` to `graph-server`.

### 01 — Rewrite spotify-auth.ts

Delete contents of `graph-server/src/ingestion/spotify-auth.ts` and rewrite from scratch.

**Must export (same public API):**
- `type SpotifyTokens` — `{ access_token, refresh_token, expires_at, scope }`
- `class SpotifyAuth` — constructor `({ config?, tokenPath? })`

**Public methods to keep (same signatures):**
- `getAccessToken(): Promise<string>` — loads from disk, refreshes if <60s to expiry
- `hasTokens(): Promise<boolean>` — checks if token file exists
- `authorize(): Promise<SpotifyTokens>` — local server, print URL, exchange code, save
- `buildAuthUrl(state: string): string` — builds Spotify auth URL
- `exchangeCode(code: string): Promise<SpotifyTokens>` — POST to token endpoint
- `refreshAccessToken(): Promise<void>` — refresh token grant
- `loadTokens(): Promise<SpotifyTokens | null>` — read JSON file
- `saveTokens(tokens: SpotifyTokens): Promise<void>` — write JSON file

**What to remove/inline:**
- All JSDoc comments and docstrings
- `tokenRequest()` private method — inline the fetch+headers into `exchangeCode()` and `refreshAccessToken()` directly
- `waitForCallback()` private method — inline the server setup into `authorize()`
- `openBrowser()` private method — inline the exec call into `authorize()`

**Behavior to preserve:**
- 60-second expiry buffer on refresh
- State validation on OAuth callback
- 120-second timeout on callback server
- Token file stored at configurable path (default `.spotify-tokens.json` relative to package root)
- Keeps old refresh_token if Spotify doesn't return a new one on refresh
- Scopes: `user-read-recently-played`, `playlist-read-private`, `playlist-read-collaborative`

### 02 — Rewrite spotify-client.ts

Delete contents of `graph-server/src/ingestion/spotify-client.ts` and rewrite from scratch.

**Must export (same public API):**
- `type SpotifyDump` — `{ recentlyPlayed, playlistTracks, exportedAt }`
- `class SpotifyClient` — constructor `(auth: SpotifyAuth)`

**Public methods to keep (same signatures):**
- `request<T>(url: string): Promise<T>` — authenticated fetch, retry on 429 (up to 3), re-auth on 401
- `getRecentlyPlayed(): Promise<RawSpotifyRecentTrack[]>` — fetch 50 recent, filter non-tracks, map fields
- `getAllPlaylists(): Promise<PlaylistSummary[]>` — paginated fetch
- `getPlaylistTracks(id, name): Promise<RawSpotifyPlaylistTrack[]>` — paginated, skip nulls/episodes, track position
- `fetchAll(): Promise<SpotifyDump>` — combine recent + all playlist tracks
- `exportToJson(path, dump?): Promise<SpotifyDump>` — write to file

**What to remove/inline:**
- All JSDoc comments
- All standalone interfaces (`SpotifyArtistRef`, `SpotifyImage`, `SpotifyAlbumRef`, `SpotifyTrackObject`, `RecentlyPlayedItem`, `RecentlyPlayedResponse`, `PlaylistSummary`, `PaginatedResponse`, `PlaylistTrackItem`) — use inline types or type at the call site
- `pickImageUrl()` standalone function — inline where used
- `sleep()` standalone function — inline where used

**Behavior to preserve:**
- 429 retry with `Retry-After` header (max 3 retries)
- 401 triggers `auth.refreshAccessToken()` and retry
- Podcast episodes filtered (type !== "track")
- Null tracks skipped
- Local files get empty string spotifyId
- Position tracking across paginated playlist tracks
- Image selection: prefer 200-400px height, fallback to first

### 03 — Update app.ts, verify tests, and reindex

- Verify `graph-server/src/server/app.ts` imports still resolve (class names unchanged, should just work)
- Update test import paths if needed (tests reference `graph-pipeline`, need to point to `graph-server`)
- Run `pnpm test` — all tests must pass
- Run `tsc --noEmit` — no type errors
- Update `reindex.sh` to point `PIPELINE_DIR` at `graph-server` instead of `graph-pipeline`
- Start the server (`cd graph-server && pnpm dev`) and run `./reindex.sh` to do a full reindex and verify the pipeline works end-to-end

## Verification

1. `cd graph-server && pnpm test` — all tests pass
2. `cd graph-server && pnpm run build` (or `tsc --noEmit`) — no type errors
3. Start server, run `./reindex.sh` — pipeline completes successfully (fetch + build)
