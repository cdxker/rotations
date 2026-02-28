# 02 — RUN: Execute `CLEANUP_PROMPT.md`

## Summary

Execute the repository cleanup workflow defined in `CLEANUP_PROMPT.md` and apply approved cleanup actions.

## Owner

Dev

## Dependencies

- All `01-*` triage tickets in this phase marked `[X]`

## Parallelizable With

- None

## Source

- Repository maintenance follow-up after PR triage

## Implementation Steps

- [ ] Read and execute the workflow in `CLEANUP_PROMPT.md`.
- [ ] Apply cleanup changes that are consistent with ticket decisions and repo rules.
- [ ] Keep edits scoped and review for accidental behavioral regressions.
- [ ] Run relevant validation commands for touched areas.
- [ ] Summarize what was changed and why.

## Exit Criteria

- [ ] Cleanup actions from `CLEANUP_PROMPT.md` are completed or explicitly documented as deferred.
- [ ] Validation checks for touched areas pass.
- [ ] Add a `## Result` section documenting final cleanup status.

## Notes

- Follow commit hygiene and staged-file rules from `AGENTS.md`.
- If `CLEANUP_PROMPT.md` conflicts with newer ticket decisions, ticket decisions take precedence and the conflict must be documented.
