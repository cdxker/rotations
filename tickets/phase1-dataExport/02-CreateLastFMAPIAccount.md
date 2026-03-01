# 02 — Create Last.fm API Account

## Summary

Create a Last.fm API account to get an API key for fetching scrobble history.

## Owner

**You (manual task)**

## Dependencies

None — can be done anytime.

## Parallelizable With

All other `02-*` tickets.

## Acceptance Criteria

- [ ] Go to https://www.last.fm/api/account/create and create an API account
- [ ] Get the **API Key** (and **Shared Secret** if needed for authenticated methods)
- [ ] Document any rate limiting info from the Last.fm API docs:
  - Safe rate: ~1 request/sec
  - Max rate: 5 requests/sec
- [ ] Store the API key securely (`.env` file, not committed to git)
- [ ] Note your Last.fm username (needed for `user.getRecentTracks` calls)

## Notes

- Last.fm auth is simpler than Spotify — it's just an API key passed as a query parameter. No OAuth flow required for read-only scrobble history.
- The `user.getRecentTracks` endpoint is public for any user, but the API key is still required.
