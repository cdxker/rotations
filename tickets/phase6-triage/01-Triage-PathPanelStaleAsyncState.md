# 01 — TRIAGE: Path Panel Async State Clobbering

## Summary

Assess whether async path fetch completion can overwrite newer UI state due to stale closure usage.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867742359`

## Triage Steps

- [ ] Reproduce by changing inputs while request is in flight.
- [ ] Confirm whether stale `state` writes can clobber updates.
- [ ] Evaluate frequency and user impact.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Schedule**

**Evidence:**
- `PathPanel.tsx` lines 191-222: the async `fetchPath()` `.then()` callback spreads `...state` from the closure, which may be stale if the user changed inputs while the request was in flight.
- The `cancelled` flag prevents callbacks from firing after cleanup, but does not prevent stale closure values within the same effect invocation.
- Scenario: user changes algorithm while a path request is in flight — the `cancelled` flag protects against the old callback, but the new callback still closes over `state` from effect creation time.
- Fix: use a functional state update or only set the fields that changed (e.g., `onStateChange(prev => ({ ...prev, loading: false, result }))`) instead of spreading the full stale `state`.

**Impact:** Low frequency — requires the user to change path parameters during an in-flight async request. Could cause UI state to revert briefly. Not a data corruption risk.

**Recommendation:** Schedule a minor fix to use functional state updates in the async callbacks.

## Notes

- Triage only. No production fix in this ticket.
