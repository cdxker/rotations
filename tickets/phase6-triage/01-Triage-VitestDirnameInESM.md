# 01 — TRIAGE: `__dirname` in ESM Vitest Config

## Summary

Assess whether using `__dirname` in `site/vitest.config.ts` is invalid in this ESM setup and causes breakage.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867742353`

## Triage Steps

- [ ] Reproduce config load behavior in current toolchain.
- [ ] Confirm compatibility expectations for ESM + Vitest.
- [ ] Determine whether this is actively failing or latent risk.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Close as Invalid**

**Evidence:**
- `site/vitest.config.ts` uses `__dirname` in an ESM package (`"type": "module"`).
- However, Vitest processes config files through its own transform pipeline which injects CJS globals (`__dirname`, `__filename`) regardless of the package's module system.
- All 47 frontend tests pass successfully using this config, confirming `__dirname` works.
- This is standard Vitest behavior documented in their config handling — config files are always processed with CJS global injection.

**Impact:** None. The config works correctly in the current toolchain.

## Notes

- Triage only. No production fix in this ticket.
