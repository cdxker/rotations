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
  ClusterLegend.tsx                 — Cluster color legend
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
|   Edge weight [==] |         Colors = cluster membership               |
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
- Cluster legend (color swatches with sizes, clickable to isolate)

**Main area (flex-1):**
- Full graph canvas taking remaining space
- Supports pan (drag), zoom (scroll), and click (select node)
- Nodes sized proportionally to play count (log scale)
- Edges drawn with opacity proportional to weight
- Nodes colored by cluster membership

**Bottom panel (h-auto, slides up on node click):**
- Shows details for selected node
- Song name, artists, album
- Key metrics: total plays, PageRank score, cluster ID
- Neighbor lists (next/previous with transition counts)
- Click a neighbor to navigate to it in the graph
- Close button to dismiss

## Visual Design

### Colors

**Background:** `#0B0B0B` (consistent with existing app)

**Node colors by cluster** (using existing chart CSS variables):
- Cluster 0: `chart-1` (dark mode: purple `oklch(0.488 0.243 264.376)`)
- Cluster 1: `chart-2` (dark mode: cyan `oklch(0.696 0.17 162.48)`)
- Cluster 2: `chart-3` (dark mode: orange-yellow `oklch(0.769 0.188 70.08)`)
- Cluster 3: `chart-4` (dark mode: purple `oklch(0.627 0.265 303.9)`)
- Cluster 4: `chart-5` (dark mode: red `oklch(0.645 0.246 16.439)`)
- Clusters 5+: cycle through chart-1 to chart-5 with reduced opacity

**Node sizing:**
- Minimum: 4px radius (1 play)
- Maximum: 20px radius (highest play count)
- Scale: `radius = 4 + 16 * log(plays) / log(maxPlays)`

**Edges:**
- Color: `white` at `5-30%` opacity (weight-mapped)
- Width: 1px (can increase for high-weight edges)
- Hover: highlight to `60%` opacity

**Text:**
- Node labels: `text-white/70` DM Mono, 10px, shown for top-N nodes by PageRank (or on zoom)
- Panel text: `text-white/90` for primary, `text-white/60` for secondary
- Metric values: `text-white` for emphasis

**Interactive states:**
- Hover node: brighten to full opacity, show tooltip with name + play count
- Selected node: bright ring, highlight all connected edges
- Hover edge: show transition count tooltip
- Filter active: dim non-matching nodes to `10%` opacity

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
