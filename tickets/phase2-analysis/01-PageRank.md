# 01 — PageRank

## Summary

Implement PageRank on the directed listening graph. Songs that are frequently transitioned to from many different songs rank higher.

## Owner

Dev

## Dependencies

- Phase 1 complete (need a constructed `ListeningGraph`)

## Parallelizable With

- `01-BasicStats.md`

## Acceptance Criteria

- [X] Implement iterative PageRank algorithm:
  - Configurable damping factor (default 0.85)
  - Convergence threshold (e.g. stop when max rank change < 0.0001)
  - Max iterations cap (e.g. 100)
- [X] Use the `next` edges (outgoing transitions) as the link structure
- [X] Edge weights should influence rank propagation (a transition that happened 10 times matters more than one that happened once)
- [X] Attach a `pageRank: number` score to each `GraphNode`
- [X] Handle edge cases:
  - Dangling nodes (songs with no outgoing edges) — redistribute their rank evenly
  - Disconnected components
- [X] Output: the same `ListeningGraph` with PageRank scores populated
- [X] Validate: top-ranked songs should intuitively make sense (frequently played, transitioned-to songs)

## Notes

- PageRank on a weighted graph: normalize outgoing edge weights per node so they sum to 1, then run standard PageRank with those as transition probabilities.
- Consider logging the top 10/20 songs by PageRank as a sanity check.

## Progress

- [X] Added `pageRank?: number` to `GraphNode` in `src/graph/types.ts`
- [X] Created `src/analysis/pagerank.ts` — `computePageRank()` + `getTopByPageRank()`
- [X] Weighted PageRank: outgoing edge weights normalized per node as transition probabilities
- [X] Dangling nodes redistribute rank evenly to all nodes
- [X] Disconnected components handled via teleportation (damping factor)
- [X] Returns metadata: iterations, converged, maxDelta
- [X] 13 tests covering all acceptance criteria

### Notes
- `computePageRank()` mutates the graph in place (sets `pageRank` on each node)
- `getTopByPageRank(graph, n)` helper returns top N sorted by rank for sanity checking
- Ranks always sum to ~1.0
