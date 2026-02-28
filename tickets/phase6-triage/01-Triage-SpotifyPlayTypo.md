# 01 — TRIAGE: `responsBody` Typo in Spotify Play API Route

## Summary

Assess whether the misspelled variable name in the Spotify play endpoint merits action.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867742350`

## Triage Steps

- [ ] Confirm issue scope (readability only vs functional risk).
- [ ] Check if typo propagates confusion elsewhere.
- [ ] Decide if this should be fixed or closed as low-value churn.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Do Now**

**Evidence:**
- `site/src/pages/api/spotify/play.ts` line 45: `const responsBody = await playResponse.text()` — typo, should be `responseBody`.
- The variable is local to the error handler (used only on line 46), so functionality is unaffected.
- This is a trivial one-line rename with zero risk.

**Impact:** None (readability only). No propagation to other files.

## Notes

- Triage only. No production fix in this ticket.
