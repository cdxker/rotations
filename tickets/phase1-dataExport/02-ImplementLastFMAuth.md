# 02 — Implement Last.fm Auth

## Summary

Set up Last.fm API key authentication for the data pipeline.

## Owner

Dev

## Dependencies

- `00-ProjectSetup.md`
- `02-CreateLastFMAPIAccount.md` (need API key at runtime)

## Parallelizable With

- `02-DataStorage.md`
- `02-CreateSpotifyDeveloperApp.md`
- `02-ImplementSpotifyOAuth.md`

## Acceptance Criteria

- [X] Config loading: read Last.fm API key and username from `.env`
- [X] Validation: fail fast with a clear error if API key or username is missing
- [X] Create a typed API client wrapper with the API key baked in (so fetchers don't need to manage auth)
- [X] Test the auth by making a simple API call (e.g. `user.getInfo`)

## Notes

- Last.fm auth is simple — just an API key as a query parameter. No OAuth flow needed.
- The shared secret is only needed if you want to call authenticated write methods (scrobbling). For read-only history export, just the API key suffices.

## Progress

- [X] Created `src/config.ts` — `loadLastfmConfig()` reads from `.env` via `dotenv`, validates presence
- [X] Created `src/ingestion/lastfm-client.ts` — `LastfmClient` class with typed `request()` and `verifyAuth()`
- [X] Created `.env.example` with expected env vars
- [X] Added `dotenv` dependency
- [X] Tests: 8 passing (config validation + client request/error handling)
