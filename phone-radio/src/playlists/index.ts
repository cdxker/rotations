import defaultPlaylist from "./default.js";
import playlist2 from "./playlist-2.js";
import playlist3 from "./playlist-3.js";
import playlist4 from "./playlist-4.js";

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
];
