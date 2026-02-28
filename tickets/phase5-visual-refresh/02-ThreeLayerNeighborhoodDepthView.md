# 02 — Three-Layer Neighborhood Depth View

## Summary

Add a depth-oriented exploration mode that shows the selected node's neighborhood up to 3 layers deep (children, children-of-children, and one layer beyond), with progressive fading based on transition commonness.

## Owner

Dev

## Dependencies

- `01-MonochromeBrightnessHierarchy.md`
- `01-NodeArtworkSupport.md`

## Parallelizable With

- None

## Acceptance Criteria

- [ ] Add a "depth view" mode that expands from selected node to exactly 3 outward layers.
- [ ] Layers are visually separated by brightness/opacity (nearer layers brighter, deeper layers fainter).
- [ ] Edge/node prominence in each layer is weighted by transition frequency/commonness.
- [ ] User can toggle depth mode on/off without losing current selected node context.
- [ ] Performance remains acceptable for medium-to-large graphs (no full-graph restyle per frame if avoidable).
- [ ] Add tests for layer selection logic (depth boundaries and weighting behavior).
- [ ] Update graph design docs with interaction and visual rules for depth mode.

## 3D Exploration Guardrails

- [ ] Include a short technical spike comparing:
  - Keep Sigma 2D with depth cues
  - Optional lightweight 3D prototype (for example Three.js) behind a feature flag
- [ ] Output a recommendation document; do not perform a full renderer migration in this ticket.

## Notes

- Intent: stronger "3D feel" through depth cues first, without overcommitting to a full 3D rewrite.

