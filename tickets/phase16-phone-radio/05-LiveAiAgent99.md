# 05 — Live AI agent on 99

## Owner

Dev

## Goal

From the playlist selector, enter `99#` to talk privately with `gpt-live-1`.
Press `9` during the conversation to return to the selector. Preserve playlist
`9#`, Discord destinations, and the saved music track.

## Requirements

- Announce the AI transfer and greet callers. Answer conversationally without tools.
- Use the OpenAI Live WebSocket API, Marin, 16 kHz PCM, and a tools-disabled
  GPT-5.6 Luna Responses backend.
- Authenticate phone audio, isolate callers, guard stale/duplicate callbacks,
  and ignore delayed menu digits after entering the agent.
- Bound audio buffers and startup time. Release sessions on exit, hangup,
  connection failure, and shutdown. Return failures to saved music once.
- Enable independently of Discord through server environment configuration.
- Do not persist or log audio or transcripts.

## Acceptance criteria

- [X] Selector `99#` connects to AI and `9#` remains a music selection.
- [X] AI socket digit `9` opens a fresh selector; late callbacks are inert.
- [X] Audio flows both ways with isolated sessions and bounded queues.
- [X] Authentication, timeout, failure, and cleanup scenarios are tested.
- [X] Phone-radio tests, lint, and build pass.
- [X] Provider access and phone-call validation outcomes are recorded.

## Validation

Implementation, automated verification, and live provider validation are complete.
The user confirmed that both the AI conversation and pressing `9` to return to
the menu work on a real phone call. The ticket is complete.

- `pnpm --filter phone-radio test`: 206 tests passed across 12 files.
- `pnpm --filter phone-radio lint`: passed.
- `pnpm --filter phone-radio build`: passed.
- Tests exercise the real provider/bridge classes together with simulated
  sockets, real local WebSocket upgrades, and isolated real Redis transactions.
- Updated file key verified with HTTP 200 for both `gpt-live-1` and
  `gpt-5.6-luna` on the official model endpoints.
- Live test used the actual bridge and provider with a synthesized spoken
  question. The agent understood "What is seven times eight?", answered
  correctly, and streamed 224,000 bytes of paced phone audio. No audio or
  transcript was persisted.
- Sending the active socket's `9` event exited once. OpenAI sent `session.closed`
  with final usage of 7 seconds; there were no protocol or bridge failures.
- The initial short live test exposed a pending-instruction error during close.
  The adapter now keeps reading until finalization or the existing timeout;
  three new regression tests cover that behavior.
- Restarted the existing phone-radio loop with inherited `OPENAI_API_KEY`
  removed, allowing the updated `phone-radio/.env` value to load. The loop now
  runs detached; its PID and log are in `~/.local/state/phone-radio/` as
  `live-agent-server.pid` and `live-agent-server.log`.
- Local and public agent routes reach application validation. The public tunnel
  remains pointed at port 3010, and Discord startup completed.
- A synthetic selector request through the public hostname returned the agent
  NCCO. Its authenticated public WebSocket connected successfully to the
  running service and streamed 226,560 bytes of audio, including non-silent
  speech. The synthetic call state was cleaned up afterward.
- User acceptance: "Both work" for `9 → 99# → conversation → 9 → menu`.

## Commit ownership

The feature builds on Discord integration files, package changes, and tests
that were already uncommitted at the start of this task. The owner subsequently
requested committing and pushing the implementation. The required Discord
code is published as a prerequisite, followed by separate AI and playlist-tool
commits. Unrelated graph and playlist-content changes remain local. The original
working files were preserved in a local baseline before editing.

## Live verification coverage

- [X] Verify project access to GPT-Live 1 and the configured Responses backend.
- [X] Run a real call through `9 → 99# → conversation → 9 → menu`.

Interruption timing, simultaneous real phone callers, and deliberately induced
phone/provider failures were not separately confirmed by the user. Automated
tests cover caller isolation, hangup, failure recovery, and session cleanup.
