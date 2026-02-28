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

- [ ] **Normalization**: Convert raw tracks to `SongKey` using `lowercase(artist) + "::" + lowercase(track_name)`
- [ ] **Last.fm edge construction**: Sort scrobbles chronologically. For each consecutive pair (A, B), increment `nodeA.next[keyB]` and `nodeB.previous[keyA]`.
- [ ] **Spotify recently-played edge construction**: Same as Last.fm — chronological pairs create edges.
- [ ] **Spotify playlist edge construction**: For each playlist, consecutive tracks create edges (weighted by 1 per playlist appearance).
- [ ] **Merge**: Combine all sources into a single `ListeningGraph`. If the same `SongKey` appears in multiple sources, merge their edges (sum weights) and union their metadata.
- [ ] **Metadata**: Populate `totalPlays`, `sources` array, and graph-level metadata (total scrobbles, date range, export timestamp, usernames).
- [ ] **Output**: Unified `ListeningGraph` as JSON.
- [ ] Handle edge cases:
  - Same song with slightly different names across sources (exact match only for now — fuzzy matching is future work)
  - Tracks with missing artist or name
  - Single-track listening sessions (no edges to create)

## Notes

- This is the core algorithm of the project. Keep it well-tested.
- Consider making the merge logic incremental — so you can re-run with new data without rebuilding from scratch.
