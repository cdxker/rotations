# Phone Radio

Express webhook server for controlling Spotify from a Vapi phone number.

## Run

```sh
pnpm --filter phone-radio dev
```

The server listens on `PHONE_RADIO_PORT`, defaulting to `3010`, and exposes:

```txt
POST /vapi
```

## Environment

```txt
PHONE_RADIO_PORT=3010
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_PHONE_REFRESH_TOKEN=
SPOTIFY_PHONE_DEVICE_ID=
SPOTIFY_PHONE_DEFAULT_PLAYLIST_URI=spotify:playlist:...
```

`SPOTIFY_PHONE_REFRESH_TOKEN` must belong to the Spotify account that owns the target Spotify Connect device.

## Vapi Assistant Prompt

Use this behavior for the inbound phone assistant:

```txt
When the call starts, say:
"Press 1 for radio, press 2 to play playlist, press 3 to queue a song."

If the caller is silent or does not press a key for 10 seconds, call the play_playlist tool.

If the caller presses 1:
Ask "What song do you want to listen to?"
Wait for the caller's spoken answer.
Say "I got {songRef}. Press 1 to confirm, 2 to try again."
If the caller presses 1, call play_radio with { songRef }.
If the caller presses 2, ask for the song again.

If the caller presses 2:
Call play_playlist.

If the caller presses 3:
Ask "What song do you want to queue?"
Wait for the caller's spoken answer.
Say "I got {songRef}. Press 1 to confirm, 2 to try again."
If the caller presses 1, call queue_song with { songRef }.
If the caller presses 2, ask for the song again.
```

## Vapi Tools

Configure these custom tools against the server URL:

```txt
https://YOUR_PHONE_RADIO_HOST/vapi
```

Tools:

```json
[
  {
    "name": "play_playlist",
    "description": "Start the default Spotify playlist.",
    "parameters": { "type": "object", "properties": {} }
  },
  {
    "name": "play_radio",
    "description": "Start playback from a requested song.",
    "parameters": {
      "type": "object",
      "properties": {
        "songRef": { "type": "string" }
      },
      "required": ["songRef"]
    }
  },
  {
    "name": "queue_song",
    "description": "Queue a requested song on Spotify.",
    "parameters": {
      "type": "object",
      "properties": {
        "songRef": { "type": "string" }
      },
      "required": ["songRef"]
    }
  }
]
```

## Example Payloads

Playlist:

```json
{
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
}
```

Radio:

```json
{
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
}
```

Queue:

```json
{
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
}
```

Successful responses have this shape:

```json
{
  "results": [
    {
      "toolCallId": "call-radio",
      "result": {
        "ok": true,
        "message": "Started This Must Be the Place by Talking Heads."
      }
    }
  ]
}
```
