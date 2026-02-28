# 02 — Fix Lint and Format Issues

## Summary

Fix existing lint errors and formatting issues across the codebase, and fix code review findings.

## Owner

**Dev**

## Dependencies

None — can be done now.

## Parallelizable With

All other in-progress tickets.

## Acceptance Criteria

- [ ] `yarn lint` passes with zero errors
- [ ] `yarn format --check` passes with zero warnings
- [ ] Fix: `spotify-auth.test.ts` — unused `writeFile` import
- [ ] Fix: `spotify-auth.ts:234` — `let server` should be `const server`
- [ ] Fix: Remove `graph-pipeline/package-lock.json` (project uses Yarn), add to `.gitignore`
- [ ] Fix: `.env.example` includes Spotify vars (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_PORT`)
- [ ] Fix: `DEFAULT_TOKEN_PATH` in `spotify-auth.ts` uses `import.meta.url` instead of fragile `process.cwd()` assumption
- [ ] Fix: `require("node:child_process")` in `spotify-auth.ts` replaced with ESM `import()`
- [ ] All tests still pass after fixes

## Notes

- These are findings from a code review of all Phase 1 commits so far.
- Run `yarn lint`, `yarn format`, and `yarn test` to verify everything is clean before committing.
