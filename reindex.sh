#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PIPELINE_DIR="$REPO_DIR/graph-server"
PORT="${GRAPH_SERVER_PORT:-3001}"
BASE_URL="http://localhost:$PORT"
USERNAME="${1:-}"

if [ -z "$USERNAME" ]; then
    echo "Usage: $0 <username>"
    exit 1
fi

echo "==> Clearing database files"
rm -f "$PIPELINE_DIR/graph.db" "$PIPELINE_DIR/graph.db-wal" "$PIPELINE_DIR/graph.db-shm"

echo "==> Queueing pipeline run for $USERNAME"
RUN_RESPONSE="$(curl -s -X POST "$BASE_URL/pipeline/run" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$USERNAME\"}")"

JOB_ID="$(echo "$RUN_RESPONSE" | jq -r '.jobId // empty')"
if [ -z "$JOB_ID" ]; then
    echo "Failed to queue pipeline run:"
    echo "$RUN_RESPONSE" | jq .
    exit 1
fi

echo "Queued job: $JOB_ID"

while true; do
    JOB_RESPONSE="$(curl -s "$BASE_URL/pipeline/run/$JOB_ID")"
    STATUS="$(echo "$JOB_RESPONSE" | jq -r '.status // empty')"

    if [ -z "$STATUS" ]; then
        echo "Failed to read job status:"
        echo "$JOB_RESPONSE" | jq .
        exit 1
    fi

    echo "Job status: $STATUS"

    case "$STATUS" in
        succeeded)
            break
            ;;
        failed|cancelled)
            echo "$JOB_RESPONSE" | jq .
            exit 1
            ;;
        queued|running)
            sleep 2
            ;;
        *)
            echo "Unexpected job status: $STATUS"
            echo "$JOB_RESPONSE" | jq .
            exit 1
            ;;
    esac
done

echo "==> Done"
