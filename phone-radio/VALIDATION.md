# Phone Radio Validation

## Build

```sh
pnpm --filter phone-radio build
```

## Run Locally

```sh
pnpm --filter phone-radio dev
```

The examples below assume the server is listening on `http://localhost:3010`.

## Playlist Tool

```sh
curl -sS http://localhost:3010/vapi \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [
        {
          "id": "call-playlist",
          "function": {
            "name": "play_playlist",
            "arguments": {}
          }
        }
      ]
    }
  }'
```

Expected successful shape:

```json
{
  "results": [
    {
      "toolCallId": "call-playlist",
      "result": {
        "ok": true,
        "message": "Started the default playlist."
      }
    }
  ]
}
```

## Radio Tool

```sh
curl -sS http://localhost:3010/vapi \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [
        {
          "id": "call-radio",
          "function": {
            "name": "play_radio",
            "arguments": { "songRef": "This Must Be the Place Talking Heads" }
          }
        }
      ]
    }
  }'
```

## Queue Tool

```sh
curl -sS http://localhost:3010/vapi \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [
        {
          "id": "call-queue",
          "function": {
            "name": "queue_song",
            "arguments": { "songRef": "Sweet Life Frank Ocean" }
          }
        }
      ]
    }
  }'
```

## Error Checks

Unsupported tool:

```sh
curl -sS http://localhost:3010/vapi \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [
        {
          "id": "call-unsupported",
          "function": {
            "name": "skip_song",
            "arguments": {}
          }
        }
      ]
    }
  }'
```

Missing song ref:

```sh
curl -sS http://localhost:3010/vapi \
  -H 'Content-Type: application/json' \
  -d '{
    "message": {
      "type": "tool-calls",
      "toolCallList": [
        {
          "id": "call-missing-song",
          "function": {
            "name": "play_radio",
            "arguments": {}
          }
        }
      ]
    }
  }'
```

Both error responses should preserve the Vapi `toolCallId` and return `ok: false`.
