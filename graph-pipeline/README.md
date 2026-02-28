# Graph Pipeline

Standalone project that constructs a directed, weighted graph from a user's listening history. Nodes are songs, edges are sequential transitions (song A played before song B). The graph captures listening patterns across multiple data sources (Last.fm, Spotify) and enables analysis via PageRank.

## Setup

```bash
yarn install
```

## Scripts

```bash
yarn build     # Compile TypeScript
yarn dev       # Watch mode
yarn test      # Run tests
yarn lint      # ESLint + type check
yarn format    # Prettier
```

## Project Structure

```
src/
├── ingestion/   # Data fetching from Last.fm, Spotify
├── graph/       # Graph construction and normalization
├── analysis/    # PageRank, stats, clustering
└── server/      # API server to serve graph data
```
