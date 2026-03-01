# 02 — Create Spotify Developer App

## Summary

Create a Spotify Developer application to get API credentials for the data export pipeline.

## Owner

**You (manual task)**

## Dependencies

None — can be done anytime.

## Parallelizable With

All other `02-*` tickets.

## Acceptance Criteria

- [ ] Go to https://developer.spotify.com/dashboard and create a new app
- [ ] Get the **Client ID** and **Client Secret**
- [ ] Set the redirect URI (e.g. `http://localhost:3000/callback` or whatever the OAuth flow will use)
- [ ] Note the required scopes:
  - `user-read-recently-played` — for recently played tracks
  - `playlist-read-private` — for private playlists
  - `playlist-read-collaborative` — for collaborative playlists
- [ ] Store credentials securely (`.env` file, not committed to git)
- [ ] Confirm `.env` is in `.gitignore`

## Notes

- The existing `site/` project already has Spotify integration (`SpotifyContext.tsx`). Check if there's already a Spotify app you can reuse or if you need a separate one for the graph pipeline.
