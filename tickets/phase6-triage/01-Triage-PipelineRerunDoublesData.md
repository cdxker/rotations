# 01 — TRIAGE: Pipeline Rerun Doubles Data

## Summary

Assess whether rerunning `/pipeline/build` or `/pipeline/run` incorrectly doubles graph counts.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- All other `01-*` triage tickets in this phase

## Source

- PR review comment: `discussion_r2867888536`

## Triage Steps

- [ ] Reproduce behavior on current branch with repeat runs.
- [ ] Confirm root cause with file/line references.
- [ ] Measure impact on node counts, edge weights, and totals.
- [ ] Choose disposition: `Do Now`, `Schedule`, `Close as Invalid`, or `Close as Not Planned`.
- [ ] If not closed, link a concrete implementation ticket.

## Exit Criteria

- [ ] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Schedule**

**Evidence:**
- `saveGraph()` in `database.ts` uses `ON CONFLICT DO UPDATE SET total_plays = nodes.total_plays + excluded.total_plays` for nodes and `weight = edges.weight + excluded.weight` for edges.
- `buildGraph()` in `build-graph.ts` always processes raw scrobbles from scratch, producing fresh edge weights.
- Rerunning the pipeline with the same data causes edge weights to double and node play counts to accumulate additively.
- The fix is straightforward: clear the graph tables before saving (`DELETE FROM edges; DELETE FROM nodes;`) or switch edges to `ON CONFLICT DO UPDATE SET weight = excluded.weight`.

**Impact:** Edge weights and play counts become incorrect after repeated runs. Affects PageRank, path-finding, and all downstream analysis. However, in normal usage the pipeline is only run once, so this is a latent correctness issue rather than an active production bug.

**Recommendation:** Schedule a fix to add `db.exec("DELETE FROM edges; DELETE FROM nodes;")` before `saveGraph()` in the build pipeline handler.

## Notes

- Triage only. No production fix in this ticket.
