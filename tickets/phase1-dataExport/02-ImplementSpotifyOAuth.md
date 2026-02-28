# 02 — Implement Spotify OAuth

## Summary

Build the OAuth2 authorization code flow for Spotify so the data pipeline can access user data.

## Owner

Dev

## Dependencies

- `00-ProjectSetup.md`
- `02-CreateSpotifyDeveloperApp.md` (need client ID/secret at runtime, not at dev time)

## Parallelizable With

- `02-DataStorage.md`
- `02-CreateLastFMAPIAccount.md`
- `02-ImplementLastFMAuth.md`

## Context

The existing `site/src/hooks/SpotifyContext.tsx` already has Spotify Web Playback SDK integration with token management. Evaluate whether that OAuth flow can be reused or adapted, or if the graph pipeline needs its own flow (likely, since this is a separate Node process, not a browser app).

## Acceptance Criteria

- [ ] Implement OAuth2 Authorization Code flow:
  - Generate auth URL with required scopes
  - Handle redirect callback, exchange code for tokens
  - Store access token + refresh token
  - Implement token refresh logic
- [ ] Required scopes: `user-read-recently-played`, `playlist-read-private`, `playlist-read-collaborative`
- [ ] Token storage: persist tokens to disk (file or DB) so the user doesn't have to re-auth every run
- [ ] Config loading: read client ID/secret from `.env`
- [ ] Simple CLI or local server to handle the OAuth redirect during initial auth
- [ ] Error handling for expired tokens, revoked access, network failures

## Notes

- This is a server-side/CLI OAuth flow, not a browser-based one.
- Consider a simple local HTTP server that opens the browser for auth, catches the redirect, and shuts down.
