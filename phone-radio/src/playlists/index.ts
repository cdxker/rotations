import defaultPlaylist from "./default.js";
import playlist2 from "./playlist-2.js";
import playlist3 from "./playlist-3.js";
import playlist4 from "./playlist-4.js";
import playlist5 from "./playlist-5.js";
import playlist6 from "./playlist-6.js";
import playlist7 from "./playlist-7.js";
import playlist8 from "./playlist-8.js";
import playlist11 from "./playlist-11.js";
import playlist12 from "./playlist-12.js";

export type Playlist = {
  number: string;
  name: string;
  tracks: string[];
};

export const DEFAULT_PLAYLIST_NUMBER = "1";

export const playlists: Playlist[] = [
  defaultPlaylist,
  playlist2,
  playlist3,
  playlist4,
  playlist5,
  playlist6,
  playlist7,
  playlist8,
  playlist11,
  playlist12,
];
