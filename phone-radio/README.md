# Phone Radio

Express webhook server for Vonage Voice API inbound calls.

Vonage calls `/answer`, receives an NCCO, then streams MP3 files from `~/Music` into the call.
During playback:

- Press `1` for the previous song.
- Press `2` for the next song.
- Press `#` to enter song selection mode.
- After the prompt, enter a 1-based song number and press `#` again.

## Run

```sh
pnpm phone-radio
```

This runs the compiled production entrypoint without hot reload. Build it first with:

```sh
pnpm --filter phone-radio build
```

For local development with hot reload:

```sh
pnpm phone-radio:dev
```

The production command listens on `PORT`, defaulting to `3010`. The root development command sets `PORT=3030`.

Start local Redis before running the phone radio server:

```sh
docker compose up -d redis
```

## Environment

```txt
PORT=3010
VONAGE_API_SECRET=
VONAGE_APPLICATION_ID=
VONAGE_PRIVATE_KEY_PATH=./private.key
REDIS_URL=redis://127.0.0.1:6379
```

`VONAGE_API_SECRET` is a shared secret. Add it to the Vonage answer URL as a query param:

```txt
https://YOUR_NGROK_URL/answer?secret=YOUR_SECRET
```

## Vonage Setup

Configure your Vonage Voice application:

```txt
Answer URL: https://YOUR_NGROK_URL/answer?secret=YOUR_SECRET
HTTP method: GET or POST
Event URL: optional
```

The answer webhook returns:

```json
[
  {
    "action": "input",
    "type": ["dtmf"],
    "mode": "asynchronous"
  },
  {
    "action": "stream",
    "streamUrl": ["https://YOUR_NGROK_URL/track/0?secret=YOUR_SECRET"],
    "loop": 1
  },
  {
    "action": "notify",
    "payload": {
      "uuid": "CALL_UUID"
    },
    "eventUrl": ["https://YOUR_NGROK_URL/track/finished/CALL_UUID"],
    "eventMethod": "POST"
  }
]
```

When `/answer` receives the call UUID from Vonage, the server stores `listener:{uuid}:track` in Redis and queues one track. The notify callback advances that Redis index and returns the next one-track NCCO.

The NCCO also registers `/input/digit` for DTMF input. Pressing `1` moves the Redis index backward and transfers the active call to a new NCCO that announces the queued song index before starting the previous track. Pressing `2` advances the Redis index and transfers the active call to a new NCCO that announces the queued song index before starting the next track. Pressing `#` transfers the call to song selection mode, then a 1-based song number followed by `#` transfers the call to that track.

Put your Vonage private key at `phone-radio/private.key`. It is ignored by git.

Use `VONAGE_PRIVATE_KEY` instead of `VONAGE_PRIVATE_KEY_PATH` only if you want to store the private key directly in `.env`; escaped `\n` line breaks are supported.
