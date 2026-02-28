/**
 * Raw ingestion types — the data shape that fetchers output before graph construction.
 *
 * Each source has its own raw type. The graph builder normalizes these into
 * SongKey-based GraphNodes with weighted edges.
 */

/** A single scrobble from Last.fm's user.getRecentTracks API. */
export interface RawScrobble {
    artist: string;
    track: string;
    album: string;
    /** Unix timestamp (seconds) of when the track was scrobbled. */
    timestamp: number;
}

/** A single track from Spotify's /v1/me/player/recently-played endpoint. */
export interface RawSpotifyRecentTrack {
    spotifyId: string;
    artist: string;
    track: string;
    album: string;
    /** ISO 8601 timestamp of when the track was played. */
    playedAt: string;
}

/** A single track from a Spotify playlist, with its position in that playlist. */
export interface RawSpotifyPlaylistTrack {
    spotifyId: string;
    artist: string;
    track: string;
    album: string;
    /** Name of the playlist this track belongs to. */
    playlistName: string;
    /** Zero-based position of this track within the playlist. */
    position: number;
}
