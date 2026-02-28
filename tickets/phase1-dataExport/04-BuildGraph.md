# 04 — Build Graph

## Summary

Take the raw JSON dumps from Last.fm and Spotify, normalize them, construct weighted edges, and merge into a unified `ListeningGraph`.

## Owner

Dev

## Dependencies

- `01-DefineGraphSchema.md`
- `03-GetDataDumpLastFM.md`
- `03-GetDataDumpSpotify.md`

## Parallelizable With

- `04-HookUpExportToDatabase.md` (partially — DB schema can be set up in parallel, but insertion needs the graph)

## Acceptance Criteria

- [X] **Normalization**: Convert raw tracks to `SongKey` using `lowercase(artist) + "::" + lowercase(track_name)`
- [X] **Last.fm edge construction**: Sort scrobbles chronologically. For each consecutive pair (A, B), increment `nodeA.next[keyB]` and `nodeB.previous[keyA]`.
- [X] **Spotify recently-played edge construction**: Same as Last.fm — chronological pairs create edges.
- [X] **Spotify playlist edge construction**: For each playlist, consecutive tracks create edges (weighted by 1 per playlist appearance).
- [X] **Merge**: Combine all sources into a single `ListeningGraph`. If the same `SongKey` appears in multiple sources, merge their edges (sum weights) and union their metadata.
- [X] **Metadata**: Populate `totalPlays`, `sources` array, and graph-level metadata (total scrobbles, date range, export timestamp, usernames).
- [X] **Output**: Unified `ListeningGraph` as JSON.
- [X] Handle edge cases:
  - Same song with slightly different names across sources (exact match only for now — fuzzy matching is future work)
  - Tracks with missing artist or name
  - Single-track listening sessions (no edges to create)

## Notes

- This is the core algorithm of the project. Keep it well-tested.
- Consider making the merge logic incremental — so you can re-run with new data without rebuilding from scratch.

## Progress

- [X] Created `src/graph/build-graph.ts` — `buildGraph(input)` function
- [X] Normalization via `toSongKey()` (case-insensitive, trimmed)
- [X] Last.fm edge construction from chronologically sorted scrobbles
- [X] Spotify recent tracks edge construction (sorted by playedAt)
- [X] Spotify playlist edge construction (grouped by playlist, sorted by position)
- [X] Cross-source merging: same SongKey merges edges (summed weights), sources, metadata
- [X] Metadata: totalScrobbles, dateRange, exportTimestamp, usernames
- [X] Edge cases: skips missing artist/name, handles single-track sessions, exact match only
- [X] 20 tests covering all acceptance criteria

### Notes
- `GraphInput` accepts any combination of sources — all fields optional
- Incremental-friendly: since `buildGraph` takes raw arrays, you can call it with combined old+new data
- Playlists processed independently (no cross-playlist edges)
