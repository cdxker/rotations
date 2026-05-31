---
name: add-phone-radio-song
description: Download a song for the phone-radio app and update its queue. Use when the user asks to add, download, place, reorder, or queue a song in phone-radio, especially from a YouTube URL or a song title/search query, and when the change should update /home/cdxker/work/cdxker/rotations/main/phone-radio/src/tracks.ts and the local phone-radio dev server.
---

# Add Phone Radio Song

## Overview

Use this workflow to add songs to the local phone-radio queue. The expected music directory is `/home/cdxker/Music/Ricky`, and the expected code file is `/home/cdxker/work/cdxker/rotations/main/phone-radio/src/tracks.ts`.

## Workflow

1. Determine the song URL.
   - If the user provided a URL, use that URL directly.
   - If the user provided only a song name, find the song link with `yt-dlp` search functionality before downloading. Prefer a precise YouTube result for the requested artist/title. Example search pattern:

```bash
yt-dlp "ytsearch1:artist title" --print "%(webpage_url)s" --skip-download
```

2. Download the song into the Ricky music directory.
   - Run `new-music "URL"` from `/home/cdxker/Music/Ricky`.
   - Quote URLs because YouTube query strings contain shell metacharacters.
   - If the command fails because of network/sandbox restrictions, rerun it with escalation.
   - Use the command output to capture the final `.mp3` filename.

3. Update the phone-radio queue.
   - Edit `/home/cdxker/work/cdxker/rotations/main/phone-radio/src/tracks.ts`.
   - Add the new absolute path, usually `/home/cdxker/Music/Ricky/<downloaded filename>.mp3`.
   - Place it exactly where the user requested: top, second, bottom, after/before another song, or the most reasonable location if the user is explicit enough.
   - Do not reorder or remove unrelated tracks unless the user asked for that.

4. Start or ensure the phone-radio dev server is running.
   - Use the project script from `/home/cdxker/work/cdxker/rotations/main`:

```bash
pnpm --dir phone-radio dev
```

   - If a dev server is already running for phone-radio, leave it running and report that it was already active.
   - Use an ongoing shell/tmux session when appropriate so the server stays up after the turn.

5. Verify and report.
   - Read the top relevant portion of `tracks.ts` to confirm the placement.
   - Report the downloaded filename, the queue position changed, and the dev server status.

## Notes

- Preserve user edits in `tracks.ts`. Check the current file before editing.
- Use explicit file edits and avoid broad git staging.
- The user sometimes says "Ricky/" or "Ricky dir"; treat that as `/home/cdxker/Music/Ricky`.
