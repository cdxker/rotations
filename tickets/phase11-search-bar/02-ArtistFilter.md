# Artist Filter

**Owner:** Dev
**Phase:** search-bar
**Depends on:** `00-HighlightNodeOnSearchSelect.md`

## Problem

The graph contains tracks from many artists, but there is no way to filter the view to only show tracks by specific artists.

## Goal

Add a multi-select artist filter next to the `SearchBar` in the top-left corner. When one or more artists are selected, only nodes whose `artists` array includes at least one of the selected artists are shown.

## Implementation Notes

- Create a single self-contained component (`ArtistFilter.tsx`) with no props. It reads everything it needs from `useGraph()` (specifically `graph`).
- All state (selected artists, artist list) lives inside the component.
- Build the artist list by scanning all loaded nodes' `artists` arrays and deduplicating. Sort by frequency (number of tracks featuring that artist, descending).
- Use the existing `Combobox` from `#/components/ui/combobox` adapted for multi-select, or a similar autocomplete dropdown.
- When `filteredArtists` is non-empty, use Sigma's node/edge reducers (via `useSigma()`) to hide any node whose `artists` array does not intersect with the selected set. Hide edges where either endpoint is hidden.
- When no artists are selected, show all nodes.
- The artist filter should compose with the depth sliders — both filters apply simultaneously (intersection).
- Place next to the `SearchBar` in the top-left toolbar area.
- Match the SearchBar's styling: `bg-neutral-900/95 border border-white/10 rounded-full` with white/monospace text.

## Acceptance Criteria

- [ ] A multi-select artist filter appears next to the SearchBar in the top-left corner.
- [ ] The filter provides autocomplete/search over all artists in the graph, sorted by track count.
- [ ] Selecting one or more artists hides all nodes that don't feature any of the selected artists.
- [ ] Edges to/from hidden nodes are also hidden.
- [ ] Clearing the filter restores all nodes.
- [ ] The artist filter composes with the depth sliders — both can be active simultaneously.
- [ ] Styling matches the SearchBar's dark pill aesthetic.
