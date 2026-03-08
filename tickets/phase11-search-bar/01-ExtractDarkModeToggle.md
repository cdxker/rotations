# Extract Dark Mode Toggle

**Owner:** Dev
**Phase:** search-bar
**Depends on:** —

## Problem

The dark mode toggle logic lives directly in `MusicGraph.tsx` as page-level state (`useState(true)` for `isDark`) with a `useEffect` that toggles `document.documentElement.classList`. Dark/light theming is a cross-cutting concern — it affects the HTML root class, sigma label colors, and the `Graph` component (which receives `isDark` as a prop). Keeping it in a single page component makes it hard to reuse or access from other parts of the app and couples presentation-layer concerns into the page orchestrator.

## Goal

Lift the `isDark` state and the `classList` side-effect out of `MusicGraph.tsx` into a shared context or custom hook (e.g. `useDarkMode` / `DarkModeProvider`) so any component in the tree can read or toggle dark mode without prop-drilling through `MusicGraph`.

## Implementation Notes

- Extract `isDark`, `setIsDark`, and the `useEffect` that calls `document.documentElement.classList.toggle('dark', isDark)` from `MusicGraph.tsx`.
- Option A — **Context**: Create a `DarkModeContext` / `DarkModeProvider` wrapping the app (or the graph route). Expose `isDark` and `toggleDark` via `useDarkMode()`.
- Option B — **Hook-only**: Create a `useDarkMode()` hook that owns the state and the classList effect. Simpler, but state is not shared across siblings unless lifted into a common parent.
- Update `MusicGraph.tsx` to consume the new context/hook instead of managing the state locally.
- Update the `Graph` component to read `isDark` from context/hook instead of receiving it as a prop.
- Remove the `isDark` prop from the `Graph` component signature and from `MusicGraphProps`.

## Acceptance Criteria

- [ ] `isDark` state and the `document.documentElement.classList.toggle` effect are no longer defined in `MusicGraph.tsx`.
- [ ] A shared `useDarkMode` hook or `DarkModeProvider` context owns the dark mode state and classList side-effect.
- [ ] `MusicGraph.tsx` consumes `isDark` and `toggleDark` from the new hook/context.
- [ ] `Graph` component reads `isDark` from the hook/context instead of a prop.
- [ ] Dark mode toggle button still works identically from the user's perspective.
- [ ] No regressions to sigma label colors or graph rendering in either light or dark mode.
