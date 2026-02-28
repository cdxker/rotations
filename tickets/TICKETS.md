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

- [-] `01-PickVisualizationLibrary.md` — Research and pick a graph viz library
- [X] `01-DesignGraphUI.md` — Wireframe the graph view UI
- [ ] `02-GraphDataLayer.md` — Connect enriched graph data to the frontend
- [ ] `02-BasicGraphRendering.md` — Render nodes and edges with force-directed layout
- [ ] `03-InteractiveFeatures.md` — Zoom, pan, click, hover, node detail panel
- [ ] `03-ClusterView.md` — Color-code and toggle clusters
- [ ] `04-SearchAndFilter.md` — Search by song/artist, filter by play count/source
- [ ] `04-PathExploration.md` — Find and display transition paths between two songs
