# 01 — Search Enter Navigation Fix

## Summary

Fix a graph search bug where selecting a song/track via keyboard Enter does not move focus/navigation to that song in the graph.

## Owner

Dev

## Dependencies

- Phase 4 complete

## Parallelizable With

- `01-MonochromeBrightnessHierarchy.md`
- `01-NodeArtworkSupport.md`

## Repro

1. Open graph view.
2. Use the search input to find a known song.
3. Use arrow keys to highlight a result.
4. Press Enter.
5. Current behavior: selected/focused node in graph does not change as expected.

## Acceptance Criteria

- [ ] Pressing Enter on a highlighted search result navigates to and focuses that node in graph view.
- [ ] Mouse click selection in search results still works.
- [ ] Focus behavior is consistent in both top search and any inline search pickers that are intended to navigate.
- [ ] Camera movement/selection state updates are visible immediately after Enter.
- [ ] Add regression test coverage for keyboard Enter selection behavior.
- [ ] No regressions to existing keyboard controls (ArrowUp/ArrowDown/Escape).

## Notes

- Scope this ticket to navigation/focus behavior only.
- Do not bundle unrelated search ranking or styling changes in this fix.

