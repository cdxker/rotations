# 00 — Frontend Dead Code Removal & Deduplication

## Summary

Delete unused components, remove mock data from production code, and deduplicate Spotify player initialization across the site/ frontend. (~490 lines)

## Owner

Dev

## Dependencies

None — can run in parallel with `00-BackendTestDedup`.

## Acceptance Criteria

- [ ] `site/src/components/PlaylistsView.tsx` deleted (80 lines, unused duplicate of PlayerView's PlaylistsContent)
- [ ] New `useSpotifyPlayer(token)` hook (~35 lines) extracted, replacing duplicate Spotify Web Playback SDK init in both `SpotifyView.tsx` (lines 71-134) and `SpotifyContext.tsx` (lines 76-139)
- [ ] `formatDuration` in SpotifyView replaced with existing `formatTime` from `lib/utils.ts`
- [ ] Mock graph builder removed from `useGraphData.ts` (118 lines) — replaced with error state on API failure
- [ ] `graphDebug` removed from `GraphView.tsx` and `GraphEvents.tsx` — replaced with inline `console.debug` or deleted
- [ ] Pages `/player`, `/spotify`, `/graph` all render correctly
- [ ] `yarn test` passes in `site/`
- [ ] Net reduction: ~490 lines

## Notes

- `PlaylistsView.tsx` is imported nowhere — confirmed dead code
- The mock graph builder is 118 lines of hardcoded song data in production; show clean error state instead
- `SpotifyView` and `SpotifyContext` both independently init the Spotify Web Playback SDK with identical code
