# 02 — Fix Sidebar Navigation Highlighting

## Summary

Clicking a neighbor node in the right-side `NodeDetailPanel` moves the camera and updates the sidebar detail view, but the **graph canvas does not update its highlighting**. The previously selected node stays visually highlighted (white with grey neighbors) instead of the newly navigated-to node.

## Owner

You (manual task)

## Human-Only Resolution

This ticket is designated **human-only**. Agents should not mark it complete or implement final resolution without explicit human direction.

## Dependencies

- Phase 7 level 01 tickets complete

## Repro

1. Open `/graph`, wait for graph to load. A random node is auto-selected.
2. In the right sidebar (`NodeDetailPanel`), click any neighbor under "Played after" or "Played before".
3. **Expected**: Camera moves to the clicked neighbor, that node turns white, its neighbors turn grey, everything else dims.
4. **Actual**: Camera moves, sidebar updates to show the new node's details, but the graph canvas still highlights the OLD node. The new node is not visually selected.

Also affects: Search bar Enter navigation (same underlying issue).

## Debugging Findings (2026-02-28)

### What works
- `NodeDetailPanel` click handler fires (`onNavigate(n.key)` called) ✓
- `handleNavigate` in `GraphView` fires ✓
- `navigateFnRef.current` (the `navigateToNode` function inside `GraphInner`) fires ✓
- `sigma.getGraph().hasNode(nodeKey)` returns true — node exists ✓
- `sigma.getCamera().animate(...)` works — camera moves to the correct position ✓
- `onSelectNode(...)` fires — `selectedNode` state in `GraphView` updates (sidebar shows new node) ✓
- `GraphEvents` reducer effect fires with the correct `externalSelectedKey` and `hoveredNode: null` ✓

### What does NOT work
- The `nodeReducer` / `edgeReducer` set via `sigma.setSetting()` inside the reducer effect do not produce a visible change in the Sigma canvas.
- Even calling `sigma.refresh()` explicitly after `sigma.setSetting()` does not force the highlighting to update.
- Even setting reducers **directly and synchronously** inside the `navigateToNode` function (bypassing the React effect chain entirely) and calling `sigma.refresh()` does not update the canvas highlighting.

### Refactors attempted (all failed to fix)
1. **Removed nullable `navigateTarget` state** — replaced with a `navigateFnRef` that holds a direct function reference. Navigation is now a synchronous function call, not a `state → effect → state` cycle. This eliminated the null-cycling pattern but did not fix the highlighting.
2. **Removed internal `selectedNode` state from `GraphEvents`** — the component now reads `externalSelectedKey` directly from props instead of syncing it through a `useEffect`. Eliminated one render delay but did not fix highlighting.
3. **Added explicit `sigma.refresh()`** at the end of the reducer effect — did not force Sigma to re-render with the new reducers.
4. **Set reducers directly in `navigateToNode`** (synchronous, no effects) — called `sigma.setSetting("nodeReducer", fn)`, `sigma.setSetting("edgeReducer", fn)`, and `sigma.refresh()` right after camera animation and `onSelectNode`. Still no visual update.

### Key observation
Clicking a node directly on the Sigma canvas (via `clickNode` event) DOES update the highlighting correctly. The difference is that `clickNode` is a Sigma-internal event, while sidebar navigation uses `sigma.setSetting()` + `sigma.refresh()` from React. This suggests either:
- Sigma's `setSetting` for reducers does not work reliably when called from outside a Sigma event handler
- React-sigma v5 (`@react-sigma/core` 5.0.6) wraps or intercepts `setSetting` in a way that defers or drops the update
- The camera animation (running concurrently) interferes with reducer application
- There is a Sigma-internal state (e.g., `highlightedNode`) set by `clickNode` that reducers alone cannot replicate

### Environment
- `@react-sigma/core`: 5.0.6
- `sigma`: check package.json (v2+)
- `react`: 19.2.1
- `graphology`: latest
- `astro`: 5.10.0

## Files involved

- `site/src/components/GraphView.tsx` — `navigateToNode` function, `GraphInner` component
- `site/src/components/graph/GraphEvents.tsx` — reducer effect, event registration
- `site/src/components/graph/NodeDetailPanel.tsx` — neighbor click handler
- `site/src/components/graph/SearchBar.tsx` — search Enter handler

## Suggested investigation

1. Check if Sigma's `clickNode` handler sets internal state (like `highlightedNodes`) that `setSetting("nodeReducer")` alone cannot replicate. If so, programmatically emit a `clickNode` event instead of manually setting reducers.
2. Check if `@react-sigma/core` v5 wraps `sigma.setSetting` and batches/defers calls.
3. Try `sigma.emit("clickNode", { node: nodeKey })` from `navigateToNode` to simulate a real click.
4. Try accessing the raw Sigma instance (not the react-sigma wrapper) and calling `setSetting` on it directly.
5. Add a log **inside** the nodeReducer function itself (e.g., for just the active node) to verify whether Sigma is calling the NEW reducer or still using an old one after `setSetting`.

## Debugging Log (2026-03-01)

### Changes attempted in this pass

1. Replaced sidebar/search navigation selection path to use Sigma's native event:
   - `GraphNavigator` now calls `sigma.emit("clickNode", { node: targetNode })`
   - Removed manual `onSelectNode(...)` construction in `GraphNavigator`
2. Added temporary debug logs in:
   - `GraphView.tsx` (`navigate: begin`, `navigate: emitted sigma clickNode`)
   - `GraphEvents.tsx` (`sigma clickNode handler`, `reducers: apply`)
3. Added explicit `sigma.refresh()` after reducer assignment and temporary post-refresh display-data logging for active/previous nodes.

### Evidence from browser logs (user-provided)

- Sidebar click triggers:
  - `navigate: begin`
  - `navigate: emitted sigma clickNode`
  - `sigma clickNode handler`
  - `reducers: apply`
- `reducers: apply` receives the expected active node and selection state:
  - `activeNode` = clicked sidebar node
  - `externalSelectedKey` = clicked sidebar node
  - `selectedNode` = clicked sidebar node
  - `hoveredNode` = `null`

Interpretation:
- State/event pipeline appears correct for sidebar navigation.
- Remaining failure is likely in render/display layer application (or environment-specific rendering behavior), not event wiring.

### Contradictory result

- Automated Playwright verification on the same branch and live `/graph` reported PASS for:
  - `Played after` sidebar click
  - `Played before` sidebar click
  - clicked node detected as highlighted (`#ffffff`, `highlighted: true`)

Interpretation:
- Bug may be intermittent, data-shape specific, browser/session specific, or tied to a rendering timing/state that automation does not reproduce.

### Current hypotheses (working notes)

1. Reducer state is updating, but a render frame may be stale or overwritten in some sessions.
2. Another Sigma/React effect may be racing and resetting visual state after reducer assignment.
3. The issue might be visible as neighborhood mismatch (old neighbors still shown) even when root node is updated.
4. Possible browser/runtime-specific behavior despite correct internal Sigma state.

### Next focused experiments

1. Capture `reducers: post-refresh display` logs from the affected user session to compare active vs previous node display data right after refresh.
2. Add a one-shot reducer invocation counter/log for `activeNode` and previous active node to confirm which reducer frame is actually being executed.
3. Temporarily disable camera animation (`animate` -> direct set) to isolate animation/render race effects.
4. If still unresolved, force Sigma remount on selection change as a diagnostic (not final fix) to determine whether renderer state is stuck.

## Acceptance Criteria

- [ ] Clicking a neighbor in `NodeDetailPanel` highlights the new node in the graph canvas (white node, grey neighbors, dark everything else).
- [ ] Search bar Enter navigation highlights the new node in the graph canvas.
- [ ] Camera movement and highlighting update are both visible immediately.
- [ ] Clicking nodes directly on the canvas still works (no regression).
- [ ] Depth mode highlighting works with sidebar navigation.
- [ ] No console errors.
- [ ] Remove all `console.log` debug statements added during investigation.

## Notes

- The original `01-SearchEnterNavigationFix` ticket (phase 5) only addressed keyboard event propagation (`stopPropagation`) and callback stability (`useCallback`). It did not fix the underlying Sigma rendering issue.
- Debug `console.log` statements are currently present in `GraphView.tsx`, `GraphEvents.tsx`, and `NodeDetailPanel.tsx` — these should be removed as part of the fix.
- The `GraphNavigator` component was deleted and `navigateTarget` nullable state was removed during this investigation. Those refactors are improvements regardless of the highlighting fix.
