# Fix Discord audio resource listener leak

Owner: Dev
Status: Complete
Depends on: 06-VoicePlaylistTools.md

## Request

Fix the phone-radio process termination that follows repeated `MaxListenersExceededWarning` messages on the Discord output `PassThrough` stream.

## Implementation

- Do not repeatedly attach new Discord audio resources to the same output stream.
- Preserve Discord audio playback and cleanly release stream resources when a session closes.
- Add a regression test that exercises repeated idle/recovery behavior and verifies stream listeners remain bounded.
- Build and restart the production phone-radio service after validation.

## Acceptance

- [X] Repeated audio-player idle events do not accumulate listeners on one stream.
- [X] Discord output continues using a valid resource after recovery.
- [X] Session shutdown destroys the active output stream and removes runtime resources.
- [X] Targeted tests, TypeScript lint, and production build pass.
- [X] The production service is restarted and responds on port 3010.

## Evidence

- The production log showed repeated `MaxListenersExceededWarning` messages for `close`, `error`, `end`, and `finish` listeners on a `PassThrough` immediately before the process was SIGKILLed.
- `DiscordVoiceSession.start()` recreated an audio resource from the same `PassThrough` every time the player entered `Idle`, causing each resource to add another listener set to the shared stream.

## Validation

- All 372 phone-radio tests pass across 18 test files.
- TypeScript lint, production build, and `git diff --check` pass.
- The regression test forces 20 idle recoveries, verifies every recovery uses a distinct stream, and confirms old and final streams are destroyed.
- Rebuilt production was restarted in tmux pane `0:0.0`; PID 4143719 is listening on port 3010 and `/answer` responds.
