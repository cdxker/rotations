# 04 — Search and Filter

## Summary

Add search and filtering controls to the graph visualization.

## Owner

Dev

## Dependencies

- `03-InteractiveFeatures.md`
- `02-GraphDataLayer.md`

## Parallelizable With

- `04-PathExploration.md`

## Acceptance Criteria

- [X] **Search**: text input to search by song name or artist
  - Autocomplete/suggestions as you type
  - Selecting a result highlights and centers the graph on that node
- [X] **Filter by source**: toggle Last.fm / Spotify-recent / Spotify-playlist data on/off
- [X] **Filter by play count**: slider (Radix UI) to set minimum play count threshold — nodes below threshold are hidden
- [X] **Filter by PageRank**: slider to show only top N% of nodes by rank
- [X] **Filter by edge weight**: slider to hide weak connections (edges below a weight threshold)
- [X] Filters should update the graph in real-time (or near real-time for large graphs)
- [X] Show active filter summary (e.g. "Showing 342 of 12,450 songs")

## Notes

- Filtering is important for large graphs — without it, the visualization is an unreadable hairball.
- Filters should compose (AND logic): applying multiple filters narrows the result.

## Progress

- [X] `SearchBar.tsx` — text input with autocomplete using `useSigma` graph search
  - Searches node labels (artist + track name), case-insensitive
  - Results sorted by play count for relevance, capped at 10
  - Arrow key navigation, Enter to select, Escape to close
  - Selecting a result navigates camera to node and selects it
- [X] `FilterPanel.tsx` — collapsible filter UI with:
  - Source toggles (Last.fm / Spotify Recent / Spotify Playlist)
  - Min plays slider (Radix UI Slider)
  - Top PageRank percentile slider
  - Min edge weight slider
  - "Showing X of Y songs" summary
  - Reset button when filters are active
- [X] `GraphFilters.tsx` — applies filters via graphology `hidden` attribute on nodes/edges
  - Runs inside SigmaContainer, uses `useSigma`
  - Computes PageRank percentile threshold dynamically
  - Hides edges connected to hidden nodes + edges below weight threshold
  - Reports visible node count and max values back for slider scaling
  - All filters compose with AND logic
- [X] Updated `GraphView.tsx` — wired search bar (top-right), filter toggle button (top-left), and filter panel

### Architecture
- Filters use graphology's `hidden` attribute rather than Sigma reducers, so they compose cleanly with the neighbor-highlighting reducers from GraphEvents
- Search runs against the in-memory graphology graph (no API call), so it's instant
- Filter panel is toggled via a button to avoid cluttering the visualization
- Radix UI Slider used for all three numeric filters (consistent with existing stack)
