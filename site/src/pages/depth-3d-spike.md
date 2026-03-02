# Depth Mode: 2D vs 3D Technical Spike

## Context

The depth view feature expands from a selected node to 3 outward layers with progressive brightness fading. This spike evaluates whether to keep the current Sigma 2D approach or prototype a lightweight 3D renderer.

## Option A: Keep Sigma 2D with Depth Cues (Recommended)

**Approach:** Use brightness hierarchy, opacity gradients, and z-index layering within Sigma's existing 2D WebGL renderer to convey depth.

**Pros:**

- Already implemented and working — zero additional integration cost
- Sigma's WebGL renderer handles 10k+ nodes at 60fps; no regression risk
- Monochrome brightness hierarchy naturally conveys "nearness" (brighter = closer)
- Per-layer weight normalization adds within-layer prominence cues
- No new dependencies; bundle size unchanged (~150KB for sigma + graphology)
- All existing features (search, filters, hover tooltips, click navigation) continue working
- Sigma's node/edge reducers are re-evaluated only on state change, not per frame

**Cons:**

- No true perspective or parallax — depth is implied, not spatial
- Limited to brightness/opacity for layer differentiation (no z-axis rotation)

## Option B: Lightweight 3D Prototype (Three.js / three-forcegraph)

**Approach:** Render the depth neighborhood in a 3D scene with concentric shells at increasing z-distances.

**Pros:**

- True spatial depth via perspective projection
- Orbit controls give users intuitive 3D exploration
- Visually striking; differentiates the product

**Cons:**

- Three.js adds ~600KB to the bundle (4x current graph viz size)
- Would require reimplementing all interactions: click, hover, tooltips, search overlay
- Force-directed layout in 3D is significantly more expensive (O(N²) per tick vs Sigma's static layout)
- Text rendering in WebGL is complex — bitmap fonts or HTML overlays both have trade-offs
- Two rendering systems to maintain (Sigma for main view, Three.js for depth mode)
- three-forcegraph struggles above ~5k nodes without aggressive LOD
- Mobile/tablet performance is poor for 3D WebGL scenes with transparency

## Recommendation

**Keep Sigma 2D with depth cues (Option A).**

The current implementation already achieves the design goal: users can visually distinguish 3 layers of neighborhood with weight-based prominence within each layer. The brightness hierarchy (`#fff` → `#bbb` → `#777` → `#444`) with per-layer edge opacity (`0.5` → `0.3` → `0.15` → `0.08`) provides clear visual separation without a renderer migration.

A 3D prototype would cost 2-3 days of integration work, add significant bundle weight, and require duplicating all interaction handlers. The ROI is low given that the 2D depth cues are already effective.

**If 3D is revisited later**, the recommended path would be:

1. Feature-flag a standalone `/graph-3d` page (not integrated into the main view)
2. Use `three-forcegraph` with a subset of the graph (depth neighborhood only, not full graph)
3. Keep Sigma as the primary renderer; 3D would be an optional exploration tool
