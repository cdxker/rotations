# Visualization Library Decision

## Context

We need a graph visualization library for Phase 3 to render the listening history graph (potentially 10k–100k nodes) with interactive features: zoom, pan, hover, click, neighbor highlighting, cluster coloring, and path exploration.

The existing site stack: **Astro 5 + React 19 + TypeScript + TailwindCSS 4 + Radix UI + shadcn/ui + TinyBase**.

All four candidates require `client:only="react"` in Astro (none support SSR).

## Options Evaluated

### 1. D3.js (d3-force)

| Aspect                | Assessment                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Render tech**       | SVG or Canvas (manual). No WebGL without additional libraries (PIXI.js, regl).                    |
| **React integration** | None — manual `useRef` + `useEffect` pattern. No wrapper library.                                 |
| **Performance**       | ~2–5k nodes (SVG), ~10–20k (Canvas). 100k not feasible without WebGL augmentation.                |
| **Interactivity**     | Zoom/pan via `d3-zoom`. Click/hover via raw DOM events. Neighbor/path highlighting: fully manual. |
| **Layouts**           | Force-directed only. No hierarchical/circular without separate libraries.                         |
| **Bundle**            | ~14 KB (d3-force alone); ~80 KB with d3-zoom + d3-selection. Tree-shakable.                       |
| **Maintenance**       | d3-force last published June 2021. Stable but infrequent releases.                                |
| **Verdict**           | Maximum flexibility, maximum implementation effort. Not enough performance headroom at 100k.      |

### 2. Cytoscape.js

| Aspect                | Assessment                                                                             |
| --------------------- | -------------------------------------------------------------------------------------- |
| **Render tech**       | Canvas. WebGL preview in v3.31+ (January 2025) but still labeled experimental.         |
| **React integration** | `react-cytoscapejs` — **unmaintained since 2022**, peer deps cap at React 18.          |
| **Performance**       | ~8–10k (Canvas), ~20–30k (WebGL preview). 100k not viable even with WebGL.             |
| **Interactivity**     | Best out-of-the-box: zoom, pan, click, hover, drag all built-in. `neighborhood()` API. |
| **Layouts**           | Richest ecosystem: 15+ layout algorithms including fcose, dagre, cola, clustered.      |
| **Bundle**            | ~112 KB gzipped. Not tree-shakable. Layout plugins add 30–150 KB each.                 |
| **Maintenance**       | Core actively maintained (v3.33.1, July 2025). React wrapper abandoned.                |
| **Verdict**           | Rich features but the unmaintained React wrapper is a dealbreaker with React 19.       |

### 3. Sigma.js + graphology (@react-sigma)

| Aspect                | Assessment                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Render tech**       | **WebGL** (native). Only WebGL-first library in the comparison.                                                                                                 |
| **React integration** | `@react-sigma/core` v5.0.6 — actively maintained, hook-based (`useSigma()`, `useRegisterEvents()`). Modern, idiomatic React API.                                |
| **Performance**       | **50k+ nodes** with pre-computed positions. Live ForceAtlas2 simulation handles ~10–20k via Web Worker. Best at scale.                                          |
| **Interactivity**     | Zoom/pan built-in. Click/hover events built-in. **Reducer pattern** for neighbor highlighting and path highlighting — the cleanest API for conditional styling. |
| **Layouts**           | ForceAtlas2 (Web Worker), circular, random via graphology packages. No hierarchical/dagre.                                                                      |
| **Bundle**            | ~80–100 KB (sigma) + ~70 KB (graphology) gzipped. Modular — install only what you need.                                                                         |
| **Maintenance**       | sigma v3.0.2 (March 2024). @react-sigma v5.0.6 (~January 2026). Both actively maintained.                                                                       |
| **Ecosystem bonus**   | `graphology-shortest-path` for path exploration (ticket 04). `graphology-communities-louvain` available.                                                        |
| **Verdict**           | Best performance, best React integration, reducer pattern matches our feature needs exactly.                                                                    |

### 4. react-force-graph (vasturiano)

| Aspect                | Assessment                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Render tech**       | Canvas (2D) or Three.js/WebGL (3D).                                                                             |
| **React integration** | First-class React component. Declarative props API — easiest to get started.                                    |
| **Performance**       | ~5–12k (2D Canvas). Documented OOM at 100k. Not viable at scale.                                                |
| **Interactivity**     | Zoom, pan, click, hover, drag all built-in via props. Neighbor/path highlighting: manual (Set-based accessors). |
| **Layouts**           | Force-directed + DAG modes only. No circular, hierarchical, or clustered.                                       |
| **Bundle**            | ~400 KB gzipped (2D). 3D variant adds Three.js (~2–3 MB).                                                       |
| **Maintenance**       | v1.48.2, February 2026. Actively maintained by single author.                                                   |
| **Verdict**           | Easiest API but insufficient performance for 100k nodes.                                                        |

## Comparison Matrix

| Criteria                 | D3.js       | Cytoscape.js    | **Sigma.js**           | react-force-graph |
| ------------------------ | ----------- | --------------- | ---------------------- | ----------------- |
| React 19 integration     | Manual      | Broken wrapper  | **Hook-based, active** | Props API         |
| 100k node rendering      | No          | No              | **Yes (static)**       | No                |
| 10k interactive perf     | Canvas only | Good            | **Great (WebGL)**      | Okay              |
| Neighbor highlighting    | Manual      | API + extension | **Reducers (native)**  | Manual            |
| Path highlighting        | Manual      | Manual          | **Reducers (native)**  | Manual            |
| Cluster coloring         | Manual      | Data-mapped     | **Node attribute**     | Props accessor    |
| Node size by PageRank    | Manual      | Data-mapped     | **Node attribute**     | Props accessor    |
| Edge thickness by weight | Manual      | Data-mapped     | **Edge attribute**     | Props accessor    |
| Layout algorithms        | Force only  | 15+ options     | ForceAtlas2 + basic    | Force + DAG       |
| Bundle size (gzipped)    | ~80 KB      | ~112 KB+        | **~170 KB total**      | ~400 KB           |
| npm weekly downloads     | 1.9M        | 1.5M            | 80K                    | 160K              |

## Recommendation: Sigma.js + graphology (via @react-sigma)

### Rationale

1. **Performance at scale** — WebGL rendering is non-negotiable for a graph that could reach 100k nodes. Sigma.js is the only library that renders at this scale without external WebGL augmentation.

2. **Best React integration** — `@react-sigma` v5 provides a modern, hook-based API (`useSigma()`, `useRegisterEvents()`, `useLoadGraph()`) that integrates naturally with React 19. The other libraries either have no wrapper (D3), an abandoned one (Cytoscape), or a simpler but less powerful one (react-force-graph).

3. **Reducer pattern matches our features** — Sigma's `nodeReducer` and `edgeReducer` let you dynamically modify appearance (color, size, visibility) based on application state. This is exactly what tickets 03-InteractiveFeatures (neighbor highlighting) and 03-ClusterView (cluster coloring/toggling) need, without manual DOM/Canvas manipulation.

4. **graphology ecosystem** — The required data model (`graphology`) comes with utilities we need:
    - `graphology-shortest-path` — for ticket 04-PathExploration (BFS and Dijkstra)
    - `graphology-layout-forceatlas2` — runs in a Web Worker, won't block the UI
    - ForceAtlas2 is particularly well-suited for music listening graphs (continuous, weighted, community-structured)

5. **Clean architecture** — Sigma separates concerns: graphology owns the data model, Sigma owns the rendering, @react-sigma owns the React bindings. This maps well to our existing separation (graph-pipeline owns data, site/ owns the UI).

### Trade-offs accepted

- **Fewer layout algorithms** than Cytoscape — we only need force-directed, so this is fine.
- **Smaller community** than D3 — 80k vs 1.9M weekly downloads. But Sigma 3.x is modern and actively maintained.
- **No node dragging built-in** — requires `@sigma/plugin-drag-nodes`. Acceptable since dragging individual nodes is a nice-to-have, not a requirement.

### Packages to install

```bash
yarn add sigma graphology graphology-types @react-sigma/core @react-sigma/layout-forceatlas2 graphology-layout-forceatlas2
```

Optional (for later tickets):

```bash
yarn add graphology-shortest-path  # ticket 04-PathExploration
```
