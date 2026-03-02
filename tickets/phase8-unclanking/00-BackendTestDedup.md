# 00 — Backend Test Deduplication

## Summary

Extract duplicated `makeNode`/`makeGraph` test helpers into a shared `test-helpers.ts` file across all graph-pipeline test files. This is the single highest-impact cleanup ticket (~650 lines).

## Owner

Dev

## Dependencies

None — this is the first ticket in the phase.

## Acceptance Criteria

- [ ] New file `graph-pipeline/src/test-helpers.ts` with shared `makeNode()`, `makeGraph()`, `buildTestGraph(edges)` helpers
- [ ] All test files updated to import from `test-helpers.ts` instead of defining their own helpers:
  - `clusters.test.ts`
  - `pagerank.test.ts`
  - `paths.test.ts`
  - `stats.test.ts`
  - `build-graph.test.ts`
  - `database.test.ts`
  - `enrich.test.ts`
- [ ] Repeated graph construction hoisted to `describe`-level `beforeEach` where possible
- [ ] Verbose inline node construction replaced with `makeNode({totalPlays: 5})` pattern
- [ ] Empty `graph-pipeline/src/index.ts` stub deleted
- [ ] `pnpm test` passes in `graph-pipeline/`
- [ ] Net reduction: ~650 lines

## Notes

- The `makeNode` and `makeGraph` helpers are copy-pasted with slight variations across 7+ test files
- `paths.test.ts` has a different signature (`buildGraph` taking edge tuples) — create a `buildTestGraph` variant
- Focus on deduplication, not changing test logic or coverage
