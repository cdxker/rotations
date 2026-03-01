# 01 — TRIAGE: Timestamp Spread Overflow in `buildGraph`

## Summary

Assess whether `Math.min(...allTimestamps)` and `Math.max(...allTimestamps)` can fail on large datasets.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867888537`

## Triage Steps

- [ ] Reproduce with large timestamp arrays representative of production data.
- [ ] Validate whether spread argument limits can crash in this runtime.
- [ ] Quantify failure threshold and risk for expected data volume.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Schedule**

**Evidence:**
- `build-graph.ts` lines 260-267 use `Math.min(...allTimestamps)` and `Math.max(...allTimestamps)`.
- JavaScript engines have a call stack argument limit (~65,536). Users with >65k scrobbles will hit `RangeError: Maximum call stack size exceeded`.
- `allTimestamps` accumulates entries from Last.fm scrobbles and Spotify recent tracks via `push(...result.timestamps)`, which itself is a secondary spread overflow risk.
- Fix is trivial: replace with `allTimestamps.reduce((min, t) => Math.min(min, t))` or a simple loop.

**Impact:** Pipeline crashes for any user with >65k total scrobbles. A moderate Last.fm user could easily exceed this.

**Recommendation:** Schedule a fix — the change is a one-liner but the failure is a hard crash, not a graceful degradation.

## Notes

- Triage only. No production fix in this ticket.
