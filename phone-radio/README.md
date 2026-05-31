# Phone Radio

Express webhook server for Vonage Voice API inbound calls.

Vonage calls `/answer`, receives an NCCO, then streams the first few MP3 files from `~/Music` into the call.
During playback, pressing `2` skips to the next track.

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

The production command listens on `PHONE_RADIO_PORT`, defaulting to `3010`. The root development command sets `PHONE_RADIO_PORT=3030`.

## Environment

```txt
PHONE_RADIO_PORT=3010
VONAGE_API_SECRET=
VONAGE_APPLICATION_ID=
VONAGE_PRIVATE_KEY_PATH=./private.key
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
    "action": "wait",
    "length": 35
  },
  {
    "action": "stream",
    "streamUrl": ["https://YOUR_NGROK_URL/track/0?secret=YOUR_SECRET"],
    "loop": 1
  },
  {
    "action": "stream",
    "streamUrl": ["https://YOUR_NGROK_URL/track/1?secret=YOUR_SECRET"],
    "loop": 1
  }
]
```

When `/answer` receives the call UUID from Vonage, the server waits 30 seconds and sends out-of-band DTMF digit `1` through the Vonage Voice API. The NCCO waits 35 seconds before starting music.

The NCCO also registers `/handleDigitPress` for DTMF input. Pressing `2` transfers the active call to a new NCCO starting at the next track.

Put your Vonage private key at `phone-radio/private.key`. It is ignored by git.

Use `VONAGE_PRIVATE_KEY` instead of `VONAGE_PRIVATE_KEY_PATH` only if you want to store the private key directly in `.env`; escaped `\n` line breaks are supported.
