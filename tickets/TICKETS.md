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

- [X] `01-MonochromeBrightnessHierarchy.md` — Remove hue-based coloring; encode importance using brightness only
- [X] `01-NodeArtworkSupport.md` — Add image/artwork support to graph nodes (frontend + ingestion/data contract)
- [X] `01-SearchEnterNavigationFix.md` — Fix bug where pressing Enter in search does not navigate focus to the selected node
- [X] `02-ThreeLayerNeighborhoodDepthView.md` — Show children-of-children to depth 3 with fading by edge/commonness and optional 3D prototype

## Phase 6 — PR Review Triage

- [X] `01-Triage-PipelineRerunDoublesData.md` — Schedule: pipeline reruns double edge weights via additive upserts
- [X] `01-Triage-SpotifyFetchDoubleCall.md` — Schedule: `fetchAll()` called twice per request (once explicit, once inside `exportToJson`)
- [X] `01-Triage-TimestampSpreadOverflow.md` — Schedule: `Math.min(...arr)` crashes at >65k scrobbles
- [X] `01-Triage-VitestDirnameInESM.md` — Closed (Invalid): Vitest injects CJS globals in config files; tests pass
- [X] `01-Triage-ImportMetaDirnameUsage.md` — Closed (Not Planned): Node 22 supports `import.meta.dirname`; no older runtime requirement
- [X] `01-Triage-SearchNoEarlyExit.md` — Reopened: `forEachNode` does not support early exit; `return` is a no-op → see `03-FixSearchEarlyExit.md`
- [X] `01-Triage-PathPanelStaleAsyncState.md` — Schedule: stale closure spreads `...state` in async callbacks
- [X] `01-Triage-GraphViewDoubleDataBuild.md` — Closed (Invalid): `useGraphData()` called once with empty dep array; no StrictMode
- [X] `01-Triage-SourceBreakdownSemantics.md` — Schedule: counts nodes per source but spec says scrobbles per source
- [X] `01-Triage-ClusterModularityNormalization.md` — Schedule: divides by `m` instead of `2m`; score is 2x too large (clustering unaffected)
- [X] `01-Triage-SpotifyPlayTypo.md` — Do Now: rename `responsBody` → `responseBody` (trivial one-liner)
- [X] `01-Triage-RemoveCleanupPromptFile.md` — Do Now: delete `CLEANUP_PROMPT.md` (completed cleanup artifact)
- [X] `02-RunCleanupPrompt.md` — Cleanup already completed in Phase 4; applied Do Now fixes (typo + deleted CLEANUP_PROMPT.md)
- [X] `03-BugBotCommentSweep.md` — All 7 BugBot comments mapped to existing triage tickets; no new tickets needed

## Phase 7 — Bug Fixes (from Triage)

- [X] `01-FixPipelineRerunDoubling.md` — Clear graph tables before save to make pipeline idempotent
- [X] `01-FixSpotifyDoubleFetch.md` — Pass pre-fetched dump to exportToJson to eliminate redundant API calls
- [X] `01-FixTimestampSpreadOverflow.md` — Replace Math.min/max spread with loop to handle >65k scrobbles
- [X] `01-FixPathPanelStaleAsync.md` — Use functional state updates in async callbacks to prevent stale closure overwrites
- [X] `01-FixSourceBreakdownSemantics.md` — Track per-source play counts and report scrobbles instead of nodes
- [X] `01-FixModularityNormalization.md` — Divide by 2m instead of m in modularity formula
- [ ] `02-FixSidebarNavigationHighlighting.md` — *(manual)* Sidebar neighbor click moves camera but does not update graph highlighting (Sigma reducer issue) — human-only
- [X] `02-FixLastfmFetcherSpreadOverflow.md` — Replace Math.max spread in checkpoint with loop to handle >65k scrobbles
- [X] `02-FixDataPathInconsistency.md` — Unify CWD-relative and import.meta.dirname data paths between fetch and build
- [X] `02-FixModularityFormula.md` — Fix computeModularity to account for non-adjacent same-community pairs
- [X] `02-RemoveSigmaInDeadCode.md` — Remove unused sigmaIn array from Louvain implementation
- [X] `02-FixSourcePlaysMerge.md` — Merge source_plays per-source counts on incremental save instead of replacing
- [X] `03-FixSearchEarlyExit.md` — Replace forEachNode with breakable loop in SearchBar and PathPanel search
- [X] `03-FixPathPanelLoadingGuard.md` — Reset loading state when path fetch is cancelled mid-flight
- [X] `03-FixToGraphologySpreadOverflow.md` — Replace Math.max spread in toGraphology with loop for >65k node graphs
- [X] `03-FixPlaylistNameCollision.md` — Key playlist grouping by ID instead of name to prevent same-name merges
- [X] `04-FixSelfLoopDoubleWeight.md` — Fix self-loop edges getting double weight in cluster adjacency
- [ ] `04-RemoveUnusedKeyIndexParam.md` — Remove unused keyIndex parameter from computeClusterStats
- [ ] `04-OptimizeDepthLayerEdgeIteration.md` — Replace full-graph edge scan with per-node iteration in depth layers
- [ ] `04-FixBootstrapReducerRace.md` — Prevent GraphEvents from clearing bootstrap reducers on initial mount
