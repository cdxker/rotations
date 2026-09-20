# Voice playlist tools

Owner: Dev
Status: Complete
Depends on: 05-LiveAiAgent99.md

## Request

Give the phone AI tools to search for songs, download/add songs, move songs between playlists, and remove playlist entries. Use the repository's add-phone-radio-song skill. The owner approved this ticket and live updates on 2026-09-20.

## Implementation

- Read the skill and follow its yt-dlp search and new-music download workflow in the Ricky directory.
- Adapt its obsolete tracks.ts reference to the registered playlist modules. Persist changes without rebuilding or restarting during a call.
- Expose bounded tools through Live Responses delegation. Use catalog and search-result IDs; ask the caller to clarify ambiguous songs or destinations.
- Preserve unrelated source edits and songs. Removing a song only removes playlist membership, never its audio file.
- Keep queued audio and completion callbacks stable across playlist changes; upcoming playback uses the updated catalog.
- Handle repeated tool calls, failed downloads, concurrent changes, and caller exit without claiming unsuccessful changes.
- Deploy the built service in tmux pane 0:0.0 as required by the skill.

## Acceptance

- [X] Search returns candidates without changing playlists.
- [X] Download/add, move, and remove persist correct playlist membership and refresh the song list.
- [X] Tools return results to the voice assistant, which reports success only after completion.
- [X] Active calls stay connected and queued songs remain correctly identified across edits.
- [X] Automated checks cover persistence, mutation failures, tool protocol, and playback changes.
- [X] Build, deploy, and verify service health and live provider tool flow.

## Implementation notes

- Six bounded functions cover catalog lookup, song lookup, search, add/download, move, and remove. Each conversation reads the requested skill and holds private search handles.
- The source catalog parses TypeScript without executing it, preserves surrounding source/comments, detects external edits, rolls back partial writes, and updates song-list.txt. Calls retain immutable queued revisions while future navigation uses current membership.
- Additions append by default and avoid duplicate target membership. Removal never deletes audio. Playlists retain at least one song so playback and failure recovery remain available.
- Downloads serialize across callers sharing the music directory. Caller exit cancels pending tool work and downloader process groups. URLs, output sizes, timeouts, and resulting MP3 paths are checked.

## Validation

- 282 tests pass across 15 files. TypeScript lint, build, and git diff --check pass.
- Real yt-dlp search returned five candidates; the actual new-music wrapper downloaded a 4,081,269-byte MP3 into an isolated temporary directory. ffprobe confirmed MP3 audio, 48 kHz stereo, 136.545 seconds. Temporary files were removed.
- Synthesized speech through the real Live provider searched temporary playlists, added a song, moved it, and removed it. All seven catalog/tool calls succeeded and provider finalization was confirmed. An earlier attempt stopped before its final removal within the probe's time limit; the repeat completed the entire sequence.
- Production playlists and music were not changed by validation. Public checks use isolated listener keys and clean them afterward.
- Deployed the built service in tmux 0:0.0 after confirming no active calls; captured its listening message on port 3010. The authenticated public 99 selector and audio WebSocket worked. A synthesized spoken question received: "Got it, let me check... It has twelve songs," matching playlist 2. Received 952,960 audio bytes with 97 nonsilent frames; completion cleanup returned HTTP 200. Silence-only checks did not produce a greeting, so verification used spoken input.
- The owner subsequently requested committing and pushing the implementation. Required Discord and live-AI code is published first; this ticket has its own commit. Unrelated graph and playlist-content changes remain local.
