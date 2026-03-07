#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PIPELINE_DIR="$REPO_DIR/graph-server"
PORT="${GRAPH_SERVER_PORT:-3001}"
BASE_URL="http://localhost:$PORT"

echo "==> Clearing database files"
rm -f "$PIPELINE_DIR/graph.db" "$PIPELINE_DIR/graph.db-wal" "$PIPELINE_DIR/graph.db-shm"

echo "==> Fetching Last.fm data"
curl -s -X POST "$BASE_URL/pipeline/fetch/lastfm" | jq .

echo "==> Fetching Spotify data"
curl -s -X POST "$BASE_URL/pipeline/fetch/spotify" | jq .

echo "==> Building graph"
curl -s -X POST "$BASE_URL/pipeline/build" | jq .

echo "==> Done"
