#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PIPELINE_DIR="$REPO_DIR/graph-pipeline"
PORT="${GRAPH_SERVER_PORT:-3001}"
BASE_URL="http://localhost:$PORT"

echo "==> Clearing database files"
rm -f "$PIPELINE_DIR/graph.db" "$PIPELINE_DIR/graph.db-wal" "$PIPELINE_DIR/graph.db-shm"

echo "==> Clearing cached fetch data and checkpoints"
rm -f "$PIPELINE_DIR/data/lastfm-scrobbles.json"
rm -f "$PIPELINE_DIR/data/lastfm-checkpoint.json"

echo "==> Running full pipeline (fetch + build)"
curl -s -X POST "$BASE_URL/pipeline/run" | jq .

echo "==> Done"
