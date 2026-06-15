import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tracks } from '../src/tracks.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDir, '..', process.argv[2] ?? 'song-list.txt');
const musicRoot = '/home/cdxker/Music/Ricky/';

const content = `${tracks
  .map((track, index) => `${index + 1}. ${track.startsWith(musicRoot) ? track.slice(musicRoot.length) : track}`)
  .join('\n\n')}\n`;

writeFileSync(outputPath, content, 'utf8');
console.log(`Wrote ${tracks.length} tracks to ${outputPath}`);
