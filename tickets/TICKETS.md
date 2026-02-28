# Ticket Status

## Phase 1 — Data Export & Graph Construction

- [X] `00-ProjectSetup.md` — Scaffold project directory, package.json, tsconfig, folder structure
- [X] `01-DefineGraphSchema.md` — Define SongKey, GraphNode, ListeningGraph types
- [X] `02-DataStorage.md` — Research and pick a database
- [X] `02-CreateSpotifyDeveloperApp.md` — *(manual)* Create Spotify developer app, get credentials
- [X] `02-CreateLastFMAPIAccount.md` — *(manual)* Create Last.fm API account, get API key
- [X] `02-ImplementSpotifyOAuth.md` — Build Spotify OAuth2 flow
- [X] `02-ImplementLastFMAuth.md` — Set up Last.fm API key auth
- [X] `03-GetDataDumpLastFM.md` — Fetch full scrobble history from Last.fm
- [X] `03-GetDataDumpSpotify.md` — Fetch recently played + playlists from Spotify
- [X] `04-BuildGraph.md` — Normalize, construct edges, merge into unified graph
- [X] `04-HookUpExportToDatabase.md` — Persist graph to chosen database
- [X] `02-FixLintAndFormat.md` — Fix lint errors, formatting issues, and code review findings
- [X] `05-CreateServer.md` — API server to serve graph data
- [X] `05-DeveloperGuide.md` — Write developer guide and onboarding docs

## Phase 2 — Analysis

- [X] `01-PageRank.md` — Implement PageRank on the listening graph
- [X] `01-BasicStats.md` — Compute summary statistics and rankings
- [X] `02-ClusterDetection.md` — Identify clusters of related tracks
- [X] `02-EnrichedExport.md` — Export graph with all analysis data attached

## Phase 3 — Visualization

- [X] `01-PickVisualizationLibrary.md` — Research and pick a graph viz library
- [X] `01-DesignGraphUI.md` — Wireframe the graph view UI
- [X] `02-GraphDataLayer.md` — Connect enriched graph data to the frontend
- [X] `02-BasicGraphRendering.md` — Render nodes and edges with force-directed layout
- [X] `03-InteractiveFeatures.md` — Zoom, pan, click, hover, node detail panel
- [X] `03-ClusterView.md` — Color-code and toggle clusters
- [X] `04-SearchAndFilter.md` — Search by song/artist, filter by play count/source
- [X] `04-PathExploration.md` — Find and display transition paths between two songs

## Phase 4 — Polish

- [X] `01-CodebaseCleanup.md` — Consolidate dead code, merge redundant files, DRY up patterns
- [X] `01-AlwaysFocusedView.md` — Always-focused single-node view, remove unfocused state

## Phase 5 — Visual Refresh

- [ ] `01-MonochromeBrightnessHierarchy.md` — Remove hue-based coloring; encode importance using brightness only
- [ ] `01-NodeArtworkSupport.md` — Add image/artwork support to graph nodes (frontend + ingestion/data contract)
- [ ] `01-SearchEnterNavigationFix.md` — Fix bug where pressing Enter in search does not navigate focus to the selected node
- [ ] `02-ThreeLayerNeighborhoodDepthView.md` — Show children-of-children to depth 3 with fading by edge/commonness and optional 3D prototype

## Phase 6 — PR Review Triage

- [ ] `01-Triage-PipelineRerunDoublesData.md` — Triage whether reruns of `/pipeline/build` and `/pipeline/run` should be addressed for data doubling
- [ ] `01-Triage-SpotifyFetchDoubleCall.md` — Triage whether `/pipeline/fetch/spotify` duplicate fetch behavior should be addressed
- [ ] `01-Triage-TimestampSpreadOverflow.md` — Triage whether timestamp spread operations should be addressed for large datasets
- [ ] `01-Triage-VitestDirnameInESM.md` — Triage whether `__dirname` usage in ESM Vitest config should be addressed
- [ ] `01-Triage-ImportMetaDirnameUsage.md` — Triage whether `import.meta.dirname` portability should be addressed
- [ ] `01-Triage-SearchNoEarlyExit.md` — Triage whether search O(N) scanning behavior should be addressed
- [ ] `01-Triage-PathPanelStaleAsyncState.md` — Triage whether path panel async stale-state risk should be addressed
- [ ] `01-Triage-GraphViewDoubleDataBuild.md` — Triage whether double graph data construction in GraphView should be addressed
- [ ] `01-Triage-SourceBreakdownSemantics.md` — Triage whether `sourceBreakdown` semantics mismatch should be addressed
- [ ] `01-Triage-SpotifyPlayTypo.md` — Triage whether low-severity variable typo should be addressed
- [ ] `01-Triage-RemoveCleanupPromptFile.md` — Triage whether `CLEANUP_PROMPT.md` should remain in the repository
