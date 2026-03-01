# 02 — Remove sigmaIn Dead Code in Louvain

## Summary

The `sigmaIn` array in the Louvain implementation (`clusters.ts`) is initialized, decremented on community removal, and incremented on community assignment — but is never read by any gain calculation or decision logic. The simplified gain formula on line 151 only uses `sigmaTot`. Remove `sigmaIn` entirely.

## Owner

Dev

## Dependencies

- `02-FixModularityFormula.md` — coordinate to avoid merge conflicts in `clusters.ts`

## Parallelizable With

- All other `02-*` tickets except `02-FixModularityFormula.md`

## Source

- BugBot comment on PR #63 (2026-03-01): "`sigmaIn` array tracked but never read in Louvain"

## Implementation Steps

- [ ] Delete `sigmaIn` declaration at line 114.
- [ ] Delete `sigmaIn[currentComm]! -= kiIn;` at line 142.
- [ ] Delete `sigmaIn[bestComm]! += kiBest;` at line 169.
- [ ] Verify no other references to `sigmaIn` exist in the file.

## Exit Criteria

- [ ] No references to `sigmaIn` remain in `clusters.ts`.
- [ ] All existing tests pass (clustering behavior unchanged).
