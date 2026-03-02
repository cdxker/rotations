# 01 — Backend Source Deduplication

## Summary

Extract shared helpers to eliminate duplicated validation, token request, node reconstruction, and env loading patterns across graph-pipeline source files. (~100 lines)

## Owner

Dev

## Dependencies

- `00-BackendTestDedup` — must be complete first (changes test infrastructure)

## Acceptance Criteria

- [ ] `parseSongKey()` helper in `server/app.ts` replaces 3x duplicated songKey validation
- [ ] `tokenRequest()` private method in `spotify-auth.ts` merges `exchangeCode`/`refreshAccessToken` (80% duplicate code)
- [ ] `rowToNode()` private method in `database.ts` merges duplicate node reconstruction in `loadGraph`/`getNode`
- [ ] `requireEnv()` helper in `config.ts` replaces 4x repeated env variable validation
- [ ] `pnpm test` passes in `graph-pipeline/`
- [ ] API endpoints `/graph`, `/graph/node/:key`, `/graph/path` return correct responses
- [ ] Net reduction: ~100 lines

## Notes

- `exchangeCode` (lines 121-159) and `refreshAccessToken` (lines 162-208) both: fetch token URL, check response, parse JSON, construct SpotifyTokens with expires_at
- `loadGraph()` and `getNode()` both reconstruct GraphNode from NodeRow with identical 10+ field mapping
- songKey validation pattern (`decodeURIComponent` + `includes("::")` check) appears at lines 75-82, 94-101, and 173-176
