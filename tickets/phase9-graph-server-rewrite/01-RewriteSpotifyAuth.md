# 01 — Rewrite spotify-auth.ts

## Summary

Delete contents of `graph-server/src/ingestion/spotify-auth.ts` and rewrite from scratch. Strip all docstrings, inline all private helper methods. Keep the same public API so tests and `app.ts` still work.

## Owner

Dev

## Dependencies

- `00-CopyGraphPipeline.md`

## Parallelizable With

- `02-RewriteSpotifyClient.md`

## Must export (same public API)

- `type SpotifyTokens` — `{ access_token, refresh_token, expires_at, scope }`
- `class SpotifyAuth` — constructor `({ config?, tokenPath? })`

## Public methods to keep (same signatures)

- `getAccessToken(): Promise<string>` — loads from disk, refreshes if <60s to expiry
- `hasTokens(): Promise<boolean>` — checks if token file exists
- `authorize(): Promise<SpotifyTokens>` — local server, print URL, exchange code, save
- `buildAuthUrl(state: string): string` — builds Spotify auth URL
- `exchangeCode(code: string): Promise<SpotifyTokens>` — POST to token endpoint
- `refreshAccessToken(): Promise<void>` — refresh token grant
- `loadTokens(): Promise<SpotifyTokens | null>` — read JSON file
- `saveTokens(tokens: SpotifyTokens): Promise<void>` — write JSON file

## What to remove/inline

- All JSDoc comments and docstrings
- `tokenRequest()` private method — inline the fetch+headers into `exchangeCode()` and `refreshAccessToken()` directly
- `waitForCallback()` private method — inline the server setup into `authorize()`
- `openBrowser()` private method — inline the exec call into `authorize()`

## Behavior to preserve

- 60-second expiry buffer on refresh
- State validation on OAuth callback
- 120-second timeout on callback server
- Token file stored at configurable path (default `.spotify-tokens.json` relative to package root)
- Keeps old refresh_token if Spotify doesn't return a new one on refresh
- Scopes: `user-read-recently-played`, `playlist-read-private`, `playlist-read-collaborative`

## Acceptance Criteria

- [ ] File rewritten with no docstrings, no private helper methods
- [ ] All `tokenRequest()` logic inlined into `exchangeCode()` and `refreshAccessToken()`
- [ ] All `waitForCallback()` logic inlined into `authorize()`
- [ ] All `openBrowser()` logic inlined into `authorize()`
- [ ] Existing tests pass unchanged
