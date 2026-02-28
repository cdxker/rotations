# 01 — Monochrome Brightness Hierarchy

## Summary

Refactor the graph UI visual system to remove color encoding and use brightness only to represent node and edge importance.

## Owner

Dev

## Dependencies

- Phase 4 complete

## Parallelizable With

- `01-NodeArtworkSupport.md`

## Acceptance Criteria

- [ ] Node and edge rendering no longer uses hue to convey meaning (cluster, source, rank, etc.).
- [ ] Visual importance is encoded by brightness/opacity only:
  - Primary selected node is brightest
  - Immediate neighbors are bright but lower than selected
  - Peripheral context is dim
- [ ] Any legends/panels that currently describe color meaning are updated or removed.
- [ ] Filter and hover states remain understandable in monochrome mode.
- [ ] Existing graph interactions still work (focus, hover, select, path mode).
- [ ] Update `site/src/pages/graph-design.md` with the new visual language.

## Notes

- Goal: cleaner, less noisy presentation with a strict grayscale hierarchy.
- Keep this ticket focused on visual encoding only, not layout rewrites.

