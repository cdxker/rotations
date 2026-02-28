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

- [ ] **Search**: text input to search by song name or artist
  - Autocomplete/suggestions as you type
  - Selecting a result highlights and centers the graph on that node
- [ ] **Filter by source**: toggle Last.fm / Spotify-recent / Spotify-playlist data on/off
- [ ] **Filter by play count**: slider (Radix UI) to set minimum play count threshold — nodes below threshold are hidden
- [ ] **Filter by PageRank**: slider to show only top N% of nodes by rank
- [ ] **Filter by edge weight**: slider to hide weak connections (edges below a weight threshold)
- [ ] Filters should update the graph in real-time (or near real-time for large graphs)
- [ ] Show active filter summary (e.g. "Showing 342 of 12,450 songs")

## Notes

- Filtering is important for large graphs — without it, the visualization is an unreadable hairball.
- Filters should compose (AND logic): applying multiple filters narrows the result.
