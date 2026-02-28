# 01 — TRIAGE: GraphView Builds Graph Data Twice

## Summary

Assess whether duplicate `useGraphData()` usage is causing unnecessary duplicate graph construction and overhead.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867742367`

## Triage Steps

- [ ] Verify duplicate hook invocation and resulting graph instances.
- [ ] Quantify overhead and potential behavioral mismatch.
- [ ] Decide if it is bug, optimization, or acceptable tradeoff.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Close as Invalid**

**Evidence:**
- `useGraphData()` is called exactly once, in `GraphInner` (`GraphView.tsx:55`).
- The hook uses an empty dependency array `[]`, so it runs once on mount.
- The hook includes a `cancelled` flag cleanup pattern to handle unmount during async fetch.
- No React StrictMode is configured (checked Astro config and all entry points).
- No duplicate component instantiation — `GraphInner` is rendered once inside `SigmaContainer`.

**Impact:** None. There is no double graph construction.

## Notes

- Triage only. No production fix in this ticket.
