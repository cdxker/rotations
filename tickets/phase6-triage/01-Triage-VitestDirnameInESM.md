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

## Notes

- Triage only. No production fix in this ticket.
