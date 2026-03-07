#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PIPELINE_DIR="$REPO_DIR/graph-server"
PORT="${GRAPH_SERVER_PORT:-3001}"
BASE_URL="http://localhost:$PORT"
USERNAME="${1:-${LASTFM_USERNAME:-}}"

if [ -z "$USERNAME" ]; then
    echo "Usage: $0 <username>"
    echo "Or set LASTFM_USERNAME env var"
    exit 1
fi

echo "==> Clearing database files"
rm -f "$PIPELINE_DIR/graph.db" "$PIPELINE_DIR/graph.db-wal" "$PIPELINE_DIR/graph.db-shm"

echo "==> Fetching Last.fm data for $USERNAME"
curl -s -X POST "$BASE_URL/pipeline/fetch/lastfm" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$USERNAME\"}" | jq .

echo "==> Building graph for $USERNAME"
curl -s -X POST "$BASE_URL/pipeline/build" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$USERNAME\"}" | jq .

echo "==> Done"
