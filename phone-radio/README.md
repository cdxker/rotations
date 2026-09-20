# Phone Radio

Express webhook server for Vonage Voice API inbound calls.

Vonage calls `/answer`, receives an NCCO, then streams MP3 files from `~/Music` into the call.
During playback, pressing `1` queues the previous track, pressing `2` skips to the next track, and pressing `9` opens playlist selection.

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

### Discord voice bridge (optional)

The bridge is intentionally disabled unless all three of these values are set:

```txt
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_VOICE_DESTINATIONS=[{"code":"90","name":"Friends","guildId":"...","channelId":"..."}]
VONAGE_WEBSOCKET_SECRET=a-long-random-secret
```

Use a dedicated Discord bot token—never a user/account token. Create the bot in
the Discord Developer Portal and install it in every configured guild with only
**View Channel**, **Connect**, and **Speak** permissions. Enable Developer Mode
in Discord, then copy the guild ID and the standard voice-channel ID into each
destination. Each `code` must be digits only, unique, and must not collide with
a second Discord destination. If a code also names a music playlist, the
Discord destination takes precedence. `DISCORD_BRIDGE_IDLE_MS` defaults to 30
seconds.

In the playlist selector, entering a configured bridge code followed by `#`
connects the caller to the mapped Discord voice channel. Phone audio and Discord
participants are mixed live; callers do not hear their own phone audio. Multiple
phone callers may share a channel. A second channel in the same guild is refused
and sent back to music. Press `9` to leave the bridge; `1` and `2` are ignored
while bridged. No audio is recorded or persisted.

The Vonage WebSocket is authorized with `VONAGE_WEBSOCKET_SECRET`; generate it
independently, for example with `openssl rand -hex 32`. Reservations expire
after 15 seconds, idle Discord sessions close after the configured timeout, and
stalled phone WebSockets are closed rather than buffered indefinitely. If Discord
login, channel access, or voice setup fails, the call returns to its saved music
track. Keep the bot token and both Vonage secrets out of git and logs.

Before a live check, run `pnpm --filter phone-radio test`, `pnpm --filter
phone-radio lint`, and `pnpm --filter phone-radio build`. Then verify a Discord
participant and two phone callers can converse, self-echo is absent, a
same-guild conflicting channel falls back to music, and `9`, hangup, and a
Discord disconnect release the session.

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
    "streamUrl": ["https://YOUR_NGROK_URL/track/1/0?secret=YOUR_SECRET"],
    "loop": 1
  },
  {
    "action": "notify",
    "payload": {
      "uuid": "CALL_UUID"
    },
    "eventUrl": ["https://YOUR_NGROK_URL/track/finished/CALL_UUID/1/0"],
    "eventMethod": "POST"
  }
]
```

When `/answer` receives the call UUID from Vonage, the server stores `listener:{uuid}:playlist` and `listener:{uuid}:track` in Redis and queues one track from playlist `1`. The notify callback includes the playlist number, advances matching current playback, and returns the next one-track NCCO.

The NCCO also registers `/input/digit` for DTMF input. Pressing `1` moves backward and pressing `2` advances within the active playlist. Pressing `9` transfers the call to a selector prompt that says "Press the playlist number followed by the pound sign." The selector uses Vonage DTMF `submitOnHash` and posts to `/input/playlist`; valid playlist numbers switch the caller to that playlist at track `0`, while invalid input returns to current playback.

Put your Vonage private key at `phone-radio/private.key`. It is ignored by git.

Use `VONAGE_PRIVATE_KEY` instead of `VONAGE_PRIVATE_KEY_PATH` only if you want to store the private key directly in `.env`; escaped `\n` line breaks are supported.
