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

### Live AI agent (optional)

From music or Discord, press `9` to open the menu, then enter `99#` to talk
privately to the AI. Press `9` during the conversation to reopen the menu.
Playlist `9#` remains available. Code `99` is reserved and cannot be a Discord
voice destination.

Set `OPENAI_API_KEY` and `VONAGE_WEBSOCKET_SECRET` in the phone-radio server
environment. The OpenAI project must have access to `gpt-live-1` and
`gpt-5.6-luna`. Inherited environment values take precedence over `.env`.
If replacing a stale inherited key with the value in `phone-radio/.env`, launch
from the repository root with `env -u OPENAI_API_KEY pnpm phone-radio` in tmux pane `0:0.0`.

This works without Discord; leave both `DISCORD_BOT_TOKEN` and
`DISCORD_VOICE_DESTINATIONS` empty for an AI-only setup. A missing AI key leaves
this option unavailable and sends callers back to music.

The server connects to OpenAI's Live WebSocket API using Marin and mono 16 kHz
PCM. Each caller gets a separate conversation. GPT-Live handles continuous
speech and interruptions; harder questions and playlist requests use a managed
Responses backend. The agent can search for songs, download/add a song, move
a song between playlists, or remove a playlist entry.

Examples: "Search for SZA Snooze", "Add Snooze to playlist 2", "Move that song
from playlist 2 to playlist 3", and "Remove Snooze from playlist 3". The agent
asks a short question when a song or playlist is ambiguous. Search alone does
not change anything. Playlists are shared; edits affect upcoming playback for
all callers. Additions append unless a position is requested. Existing songs
are not duplicated, and removal keeps the MP3 file. Each playlist must retain
at least one song.

The tool backend reads `.agents/skills/add-phone-radio-song/SKILL.md` when a
conversation starts. It uses the skill's `yt-dlp` search and `new-music`
download workflow in `/home/cdxker/Music/Ricky`. YouTube results have private
IDs for each conversation; explicit YouTube video links are also supported.
The downloader requires the installed `yt-dlp`, `new-music`, and FFmpeg.
Search times out after 30 seconds and downloads after 120 seconds. Leaving the
AI session cancels pending work before playlist commit.

The owner approved adapting the skill's obsolete `src/tracks.ts` path to
`src/playlists/*.ts` and applying changes live. Tools preserve surrounding
source, serialize edits, refresh `song-list.txt`, and publish the catalog only
after saving succeeds. No rebuild or restart occurs for a song edit. Startup
reads the saved sources, so edits survive a restart before the next build.
Queued audio and completion URLs carry immutable playlist revisions. A
removed song can finish for another caller, then playback finds its next
surviving neighbor in the updated playlist. Out-of-process track edits require
a service restart before further voice edits.

To deploy code changes, build first, stop the exact old server, then run
`env -u OPENAI_API_KEY pnpm phone-radio` in tmux pane `0:0.0`. Confirm the pane
reports `Phone radio server listening`. The agent cannot transfer calls to a
person or run arbitrary shell commands.

The server authenticates `/agent/audio` using the WebSocket secret and a
single-use, per-call reservation. Connection setup times out after 15 seconds.
It bounds audio queues and returns a failed session to the saved music track,
restarting that song. The application does not record or log audio/transcripts;
Live session storage is disabled. On exit it closes the provider session and
waits up to 15 seconds for finalization before terminating the connection.

Every newly opened selector has a unique callback ID. Callbacks from a selector
opened before this version are ignored; callers should reopen the menu after a
restart. Individual DTMF callbacks during selection/AI are ignored so delayed
`99` digits cannot interrupt the new conversation. AI exit uses DTMF from its
own active audio socket.

Before enabling this on the public phone number, run the tests, lint, and build,
then check `9 → 99# → conversation → 9 → menu` on a real phone. Interrupt the AI,
try two concurrent callers, hang up during connection, and verify a provider
failure returns to music. Provider credentials and an inbound test call are
required to validate real audio quality and interruption timing.

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

The NCCO also registers `/input/digit` for DTMF input. Pressing `1` moves backward and pressing `2` advances within the active playlist. Pressing `9` transfers the call to a selector prompt that offers playlist numbers and `99#` for the AI agent The selector uses Vonage DTMF `submitOnHash` and posts to `/input/playlist`; valid playlist numbers switch the caller to that playlist at track `0`, while invalid input returns to current playback.

Put your Vonage private key at `phone-radio/private.key`. It is ignored by git.

Use `VONAGE_PRIVATE_KEY` instead of `VONAGE_PRIVATE_KEY_PATH` only if you want to store the private key directly in `.env`; escaped `\n` line breaks are supported.
