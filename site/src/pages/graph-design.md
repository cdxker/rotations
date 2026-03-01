# Graph Visualization UI Design

## Integration Approach

**New Astro page at `/graph`** — separate from the music player.

Rationale:

- The graph is an analytical view, conceptually different from the playback experience
- It needs a full-screen canvas with its own interaction model (pan/zoom vs playlist scrolling)
- Avoids bloating the player page with a heavy graph library
- Uses `client:load` on a `<GraphView />` React component, wrapped in Layout.astro for ViewTransitions
- Navigation: add a link/button to the graph page from the existing player (or vice versa)

File structure:

```
site/src/pages/graph.astro          — Astro page shell
site/src/components/GraphView.tsx   — Main graph view (React, client:load)
site/src/components/graph/
  GraphCanvas.tsx                   — Graph rendering canvas (viz library)
  NodeDetailPanel.tsx               — Sidebar panel for selected node
  GraphControls.tsx                 — Top bar: search, filters, view toggles
  StatsPanel.tsx                    — Summary statistics overlay
  ClusterLegend.tsx                 — Cluster legend (monochrome)
```

## Page Layout

```
+-----------------------------------------------------------------------+
|  [< Back to Player]              LISTENING GRAPH           [Stats] [?] |
+-----------------------------------------------------------------------+
|                    |                                                    |
|   CONTROLS         |                                                   |
|   +-----------+    |                                                   |
|   | Search    |    |           GRAPH CANVAS                            |
|   +-----------+    |        (force-directed layout)                    |
|                    |                                                   |
|   Filters:         |         Nodes = songs (sized by play count)       |
|   Min plays [==]   |         Edges = transitions (opacity by weight)   |
|   Edge weight [==] |         Brightness = importance (PageRank)        |
|   Source [v]       |                                                   |
|                    |                                                   |
|   View:            |                                                   |
|   ( ) All          |                                                   |
|   (o) Clusters     |                                                   |
|   ( ) PageRank     |                                                   |
|                    |                                                   |
|   CLUSTER LEGEND   |                                                   |
|   * Cluster 1 (42) |                                                   |
|   * Cluster 2 (38) |                                                   |
|   * Cluster 3 (25) |                                                   |
|   ...              |                                                   |
|                    |                                                   |
+--------------------+---------------------------------------------------+
|                    NODE DETAIL PANEL (shown on click)                   |
|                    +--------------------------------------------------+|
|                    | Song Name                              x close   ||
|                    | Artist(s)          Album                         ||
|                    | Plays: 47  PageRank: 0.0034  Cluster: 2          ||
|                    |                                                  ||
|                    | Next (5)           Previous (3)                  ||
|                    | > Song B (x3)      > Song D (x2)                ||
|                    | > Song C (x2)      > Song E (x1)                ||
|                    | > Song F (x1)      > Song G (x1)                ||
|                    +--------------------------------------------------+|
+-----------------------------------------------------------------------+
```

### Layout Breakdown

**Left sidebar (w-64, fixed):**

- Search input (filter nodes by name/artist)
- Filter sliders (min play count, edge weight threshold)
- Source filter dropdown (all / lastfm / spotify-recent / spotify-playlist)
- View mode radio buttons (All / Clusters / PageRank)
- Cluster legend (cluster names with sizes, clickable to isolate)

**Main area (flex-1):**

- Full graph canvas taking remaining space
- Supports pan (drag), zoom (scroll), and click (select node)
- Nodes sized proportionally to play count (log scale)
- Edges drawn with opacity proportional to weight
- Nodes brightness-encoded by importance (PageRank)

**Bottom panel (h-auto, slides up on node click):**

- Shows details for selected node
- Album artwork (if available), song name, artists, album
- Key metrics: total plays, PageRank score, cluster ID
- Neighbor lists (next/previous with transition counts)
- Click a neighbor to navigate to it in the graph
- Close button to dismiss

## Artwork Support

Album artwork is sourced from Spotify and Last.fm during ingestion:

- **Spotify**: `album.images[]` from recently-played and playlist endpoints (medium ~300px preferred)
- **Last.fm**: `image[]` from `user.getRecentTracks` (extralarge/large preferred)
- **Merging**: First non-empty URL wins during graph construction (Spotify typically has higher quality)
- **Storage**: Persisted as `image_url TEXT` in the nodes table; survives graph rebuilds via COALESCE upsert
- **Frontend**: Shown in the detail panel header and hover tooltip; missing images degrade to a placeholder
- **Limitations**: Images are external URLs — they may become stale if the source service removes them

## Visual Design

### Colors — Monochrome Brightness Hierarchy

**Background:** `#0B0B0B` (consistent with existing app)

**Node brightness by importance** (strict grayscale, no hue encoding):

- Brightness is determined by PageRank (normalized 0–1 against graph max)
- Least important: `rgb(64, 64, 64)` (~25% brightness)
- Most important: `rgb(204, 204, 204)` (~80% brightness)
- Formula: `level = 64 + 140 * importance`

**Interactive brightness hierarchy:**

- Selected/focused node: `#ffffff` (brightest, 100%)
- Immediate neighbors: `#999` (~60%)
- Peripheral context: `#333` (~20%, labels hidden)
- Path-highlighted nodes: `#ddd` (~87%)
- Dim/filtered nodes: `#222` (~13%)

**Node sizing:**

- Minimum: 4px radius (1 play)
- Maximum: 20px radius (highest play count)
- Scale: `radius = 4 + 16 * log(plays) / log(maxPlays)`

**Edges:**

- Color: `white` at `3-25%` opacity (weight-mapped)
- Width: log-scaled from weight
- Selected-node edges: `white` at `40%` opacity
- Path edges: `white` at `60%` opacity, 3px width

**Text:**

- Node labels: `text-white/70` DM Mono, 10px, shown for top-N nodes by PageRank (or on zoom)
- Panel text: `text-white/90` for primary, `text-white/60` for secondary
- Metric values: `text-white` for emphasis

**Depth mode (3-layer neighborhood):**

When depth mode is toggled on, the view expands from the selected node to 3 outward layers:

- Layer 0 (root): `#ffffff` — selected node, highlighted, zIndex 2
- Layer 1: `#bbb` base — direct neighbors, brightness scaled by normalized weight within layer
- Layer 2: `#777` base — two hops out, brightness scaled by weight
- Layer 3: `#444` base — three hops out, brightness scaled by weight
- Outside neighborhood: `#222`, labels hidden, zIndex -2

Edge opacity follows the deepest endpoint:
- Layer 0–1 edges: `0.5` opacity
- Layer 1–2 edges: `0.3` opacity
- Layer 2–3 edges: `0.15` opacity
- Layer 3+ edges: `0.08` opacity
- Edges outside the neighborhood: hidden

Weight normalization: within each depth layer, edge weights are normalized to 0–1 (max weight in that layer = 1.0). Node brightness is then scaled: `brightness = base * (0.5 + 0.5 * normalizedWeight)`.

Toggle: "Depth" button next to the search bar. Toggling preserves the current selected node.

**Interactive states:**

- Hover node: brighten to full white, show tooltip with name + play count
- Selected node: white (`#fff`) with highlighted ring, all connected edges visible
- Hover edge: show transition count tooltip
- Filter active: dim non-matching nodes to `#222`

### Typography

- All text: DM Mono (matches existing app)
- Panel headings: `text-sm font-medium text-white/90`
- Metric labels: `text-xs text-white/50`
- Metric values: `text-sm text-white`
- Node labels on canvas: 10-12px DM Mono

### Controls styling

- Search input: `bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-md`
- Sliders: Radix UI slider with existing blue/coral theme
- Buttons: shadcn Button `variant="ghost"` or `variant="outline"`
- Radio buttons: custom styled to match dark theme

## Responsive Considerations

**Desktop-first design.** Graph visualization requires significant screen real estate for meaningful interaction.

- **Desktop (1024px+):** Full layout as described above. Sidebar + canvas + bottom panel.
- **Tablet (768-1023px):** Sidebar collapses to a top bar with expandable filters. Canvas takes full width. Bottom panel stays.
- **Mobile (<768px):** Show stats/list view instead of graph canvas. Display top songs by PageRank, cluster list, and search. Link to "open in desktop" for full graph. The force-directed layout is not practical on small screens.

## Data Flow

```
GraphView.tsx
├── useEffect: fetch /graph/stats → StatsPanel
├── useEffect: fetch /graph/analysis → cluster data, rankings
├── useEffect: fetch /graph?limit=N → paginated nodes for canvas
├── onClick(node): fetch /graph/neighbors/:songKey → NodeDetailPanel
└── onSearch: filter client-side or fetch /graph/node/:songKey
```

The graph data layer (ticket `02-GraphDataLayer`) will implement the fetching logic. This design assumes the API endpoints from the graph-pipeline server (`05-CreateServer`).

## Stats Panel (toggleable overlay)

Shown when clicking the [Stats] button in the top bar:

```
+----------------------------------+
|  GRAPH STATISTICS          close |
|                                  |
|  Total Songs:     12,847         |
|  Total Edges:     45,293         |
|  Total Scrobbles: 127,412        |
|  Date Range:      2019 — 2025    |
|                                  |
|  Sources:                        |
|    Last.fm:       95%            |
|    Spotify Recent: 3%            |
|    Spotify Playlists: 2%         |
|                                  |
|  Avg Degree:      7.2            |
|  Median Degree:   4              |
|  Clusters:        23             |
+----------------------------------+
```

Styled as a floating card: `bg-[#181818] border border-white/10 rounded-lg p-6 shadow-xl`
