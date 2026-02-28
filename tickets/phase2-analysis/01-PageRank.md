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

- [ ] Implement iterative PageRank algorithm:
  - Configurable damping factor (default 0.85)
  - Convergence threshold (e.g. stop when max rank change < 0.0001)
  - Max iterations cap (e.g. 100)
- [ ] Use the `next` edges (outgoing transitions) as the link structure
- [ ] Edge weights should influence rank propagation (a transition that happened 10 times matters more than one that happened once)
- [ ] Attach a `pageRank: number` score to each `GraphNode`
- [ ] Handle edge cases:
  - Dangling nodes (songs with no outgoing edges) — redistribute their rank evenly
  - Disconnected components
- [ ] Output: the same `ListeningGraph` with PageRank scores populated
- [ ] Validate: top-ranked songs should intuitively make sense (frequently played, transitioned-to songs)

## Notes

- PageRank on a weighted graph: normalize outgoing edge weights per node so they sum to 1, then run standard PageRank with those as transition probabilities.
- Consider logging the top 10/20 songs by PageRank as a sanity check.
