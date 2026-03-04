# 00 — Copy graph-pipeline to graph-server

## Summary

Copy the entire `graph-pipeline/` directory to a new `graph-server/` directory. This is the new home for the rewritten code. `graph-pipeline/` stays as-is for reference.

## Owner

Dev

## Dependencies

None

## Acceptance Criteria

- [ ] `graph-server/` exists as a full copy of `graph-pipeline/`
- [ ] `pnpm install` works in `graph-server/`
- [ ] `pnpm test` passes in `graph-server/`
- [ ] Test import paths updated from `graph-pipeline` to `graph-server`
