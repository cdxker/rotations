import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { playlists } from '../src/playlists/index.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDir, '..', process.argv[2] ?? 'song-list.txt');
const musicRoot = '/home/cdxker/Music/Ricky/';

const playlistLines = playlists.flatMap((playlist) => [
  `# ${playlist.number}. ${playlist.name}`,
  ...playlist.tracks.map(
    (track, index) =>
      `${index + 1}. ${track.startsWith(musicRoot) ? track.slice(musicRoot.length) : track}`,
  ),
]);

const content = `${playlistLines.join('\n\n')}\n`;

writeFileSync(outputPath, content, 'utf8');
console.log(`Wrote ${playlistLines.length} playlist lines to ${outputPath}`);
