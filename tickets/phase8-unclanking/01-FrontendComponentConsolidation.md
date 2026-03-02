# 01 — Frontend Component Consolidation

## Summary

Consolidate duplicate search/autocomplete logic, extract shared playlist card component, inline trivial wrapper components, and clean up commented-out code. (~280 lines)

## Owner

Dev

## Dependencies

- `00-FrontendDeadCodeDedup` — must be complete first (modifies some of the same files)

## Acceptance Criteria

- [ ] New `useNodeSearch(sigma)` hook extracted from shared logic between `SearchBar.tsx` and `PathPanel.tsx`'s NodePicker — both components use this hook but render differently
- [ ] New `PlaylistGridCard` component extracted from duplicate playlist card rendering in `SpotifyView.tsx` and `SpotifyAddView.tsx`
- [ ] `GraphNavigator` component (37-line wrapper for one useEffect) inlined into `GraphInner` in `GraphView.tsx`
- [ ] Commented-out code removed from `TimeSlider.tsx` (Rewind/FastForward imports, commented JSX)
- [ ] `SearchBar.test.ts` updated to test extracted `useNodeSearch` hook directly
- [ ] Graph search, path finding, and playlist display all work correctly
- [ ] `yarn test` passes in `site/`
- [ ] Net reduction: ~280 lines

## Notes

- `NodePicker` in PathPanel (152 lines) and `SearchBarInner` in SearchBar (141 lines) share ~80% identical logic: query/results/isOpen state, graph search, keyboard handling, click-outside close
- The shared hook should return query, results, isOpen, selectedIndex, handleSelect, handleKeyDown, refs
- `PlaylistGridCard` should accept `playlist`, `onClick`, `isSelected?`, `children?` props
