# 01 — TRIAGE: `import.meta.dirname` Portability Risk

## Summary

Assess whether `import.meta.dirname` usage in ingestion code is unstable across runtimes/tooling.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867742354`

## Triage Steps

- [ ] Verify behavior under project runtime/toolchain.
- [ ] Check type support and compatibility guarantees.
- [ ] Determine if this is current failure or future portability risk.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Close as Not Planned**

**Evidence:**
- `import.meta.dirname` is used in `graph-pipeline/src/ingestion/lastfm-fetcher.ts` to resolve the data directory path.
- The project runs Node.js v22.16.0, which fully supports `import.meta.dirname` (available since Node 20.11.0).
- The project has no `engines` field in package.json, but this is a personal project with no requirement to support older runtimes.
- `import.meta.dirname` is the idiomatic ESM replacement for `__dirname` and is now a stable Node.js API.

**Impact:** None under current runtime. If older Node support were needed, adding `engines: { "node": ">=20.11.0" }` to `package.json` would make the requirement explicit.

**Recommendation:** No action needed. Optionally add `engines` field to document the minimum Node version.

## Notes

- Triage only. No production fix in this ticket.
