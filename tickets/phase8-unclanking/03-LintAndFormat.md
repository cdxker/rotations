# 03 — Lint & Format

## Summary

Run linters and formatters across both projects to ensure consistent code style after all cleanup changes. Fix any issues introduced by refactoring.

## Owner

Dev

## Dependencies

- `02-GraphEventsReducerCleanup` — must be complete
- `02-MicroOptimizationsHygiene` — must be complete

## Acceptance Criteria

- [ ] `cd graph-pipeline && pnpm run lint` — zero errors
- [ ] `cd site && yarn lint` — zero errors
- [ ] `cd graph-pipeline && pnpm run format` — applied
- [ ] `cd site && yarn format` — applied
- [ ] `cd graph-pipeline && pnpm run format -- --check` — no diffs
- [ ] `cd site && yarn format -- --check` — no diffs
- [ ] `cd graph-pipeline && pnpm test` — all pass
- [ ] `cd site && yarn test` — all pass
- [ ] Graph server starts and serves data at localhost:3001
- [ ] Site dev server renders all pages at localhost:4322
- [ ] Final `wc -l` on all source files confirms ~2,000 line reduction from baseline

## Notes

- Fix any lint errors introduced by refactoring (unused imports, type issues, etc.)
- This is the final quality gate before the phase is complete
- Run formatters last so they don't conflict with lint fixes
