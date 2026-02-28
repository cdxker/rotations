import { writeFile } from "node:fs/promises";
import { SpotifyAuth } from "./spotify-auth.js";
import type {
    RawSpotifyRecentTrack,
    RawSpotifyPlaylistTrack,
} from "./types.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/** Spotify API response types (only what we need). */

interface SpotifyArtistRef {
    name: string;
}

interface SpotifyAlbumRef {
    name: string;
}

interface SpotifyTrackObject {
    id: string;
    name: string;
    artists: SpotifyArtistRef[];
    album: SpotifyAlbumRef;
    is_local: boolean;
    type: string;
}

interface RecentlyPlayedItem {
    track: SpotifyTrackObject;
    played_at: string;
}

interface RecentlyPlayedResponse {
    items: RecentlyPlayedItem[];
    next: string | null;
    cursors?: { after: string; before: string };
}

interface PlaylistSummary {
    id: string;
    name: string;
    tracks: { total: number };
}

interface PaginatedResponse<T> {
    items: T[];
    next: string | null;
    total: number;
    limit: number;
    offset: number;
}

interface PlaylistTrackItem {
    track: SpotifyTrackObject | null;
    is_local: boolean;
}

export interface SpotifyDump {
    recentlyPlayed: RawSpotifyRecentTrack[];
    playlistTracks: RawSpotifyPlaylistTrack[];
    exportedAt: string;
}

export class SpotifyClient {
    private readonly auth: SpotifyAuth;

    constructor(auth: SpotifyAuth) {
        this.auth = auth;
    }

    /**
     * Make an authenticated request to the Spotify API.
     * Handles 429 rate-limit responses with automatic retry.
     */
    async request<T>(url: string): Promise<T> {
        const maxRetries = 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const accessToken = await this.auth.getAccessToken();
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (response.status === 429) {
                const retryAfter = parseInt(
                    response.headers.get("Retry-After") ?? "5",
                    10,
                );
                if (attempt < maxRetries) {
                    console.log(
                        `Rate limited. Waiting ${retryAfter}s before retry (${attempt + 1}/${maxRetries})...`,
                    );
                    await sleep(retryAfter * 1000);
                    continue;
                }
                throw new Error(
                    `Spotify API rate limited after ${maxRetries} retries`,
                );
            }

            if (response.status === 401) {
                // Token might have expired between getAccessToken and the request
                if (attempt < maxRetries) {
                    await this.auth.refreshAccessToken();
                    continue;
                }
                throw new Error(
                    "Spotify API authentication failed after retry",
                );
            }

            if (!response.ok) {
                const body = await response.text();
                throw new Error(
                    `Spotify API error (${response.status}): ${body}`,
                );
            }

            return (await response.json()) as T;
        }

        throw new Error("Spotify API request failed after all retries");
    }

    /** Fetch recently played tracks (max 50 from Spotify). */
    async getRecentlyPlayed(): Promise<RawSpotifyRecentTrack[]> {
        const data = await this.request<RecentlyPlayedResponse>(
            `${SPOTIFY_API_BASE}/me/player/recently-played?limit=50`,
        );

        return data.items
            .filter((item) => item.track.type === "track")
            .map((item) => ({
                spotifyId: item.track.id,
                artist: item.track.artists.map((a) => a.name).join(", "),
                track: item.track.name,
                album: item.track.album.name,
                playedAt: item.played_at,
            }));
    }

    /** Fetch all user playlists (paginated). */
    async getAllPlaylists(): Promise<PlaylistSummary[]> {
        const playlists: PlaylistSummary[] = [];
        let nextUrl: string | null =
            `${SPOTIFY_API_BASE}/me/playlists?limit=50&offset=0`;

        while (nextUrl !== null) {
            const data: PaginatedResponse<PlaylistSummary> =
                await this.request(nextUrl);
            playlists.push(...data.items);
            nextUrl = data.next;
        }

        return playlists;
    }

    /**
     * Fetch all tracks for a single playlist (paginated).
     * Filters out podcast episodes and null tracks.
     * Preserves track ordering via position index.
     */
    async getPlaylistTracks(
        playlistId: string,
        playlistName: string,
    ): Promise<RawSpotifyPlaylistTrack[]> {
        const tracks: RawSpotifyPlaylistTrack[] = [];
        let nextUrl: string | null =
            `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100&offset=0`;
        let position = 0;

        while (nextUrl !== null) {
            const data: PaginatedResponse<PlaylistTrackItem> =
                await this.request(nextUrl);

            for (const item of data.items) {
                // Skip null tracks (removed/unavailable)
                if (!item.track) {
                    position++;
                    continue;
                }
                // Skip podcast episodes
                if (item.track.type !== "track") {
                    position++;
                    continue;
                }

                tracks.push({
                    // Local files have no Spotify ID
                    spotifyId: item.track.is_local ? "" : item.track.id,
                    artist: item.track.artists.map((a) => a.name).join(", "),
                    track: item.track.name,
                    album: item.track.album.name,
                    playlistName,
                    position,
                });

                position++;
            }

            nextUrl = data.next;
        }

        return tracks;
    }

    /**
     * Fetch all data from Spotify: recently played + all playlist tracks.
     * Returns the full dump ready for JSON export.
     */
    async fetchAll(): Promise<SpotifyDump> {
        console.log("Fetching recently played tracks...");
        const recentlyPlayed = await this.getRecentlyPlayed();
        console.log(`  Got ${recentlyPlayed.length} recently played tracks`);

        console.log("Fetching playlists...");
        const playlists = await this.getAllPlaylists();
        console.log(`  Found ${playlists.length} playlists`);

        const playlistTracks: RawSpotifyPlaylistTrack[] = [];
        for (const playlist of playlists) {
            console.log(
                `  Fetching tracks for "${playlist.name}" (${playlist.tracks.total} tracks)...`,
            );
            const tracks = await this.getPlaylistTracks(
                playlist.id,
                playlist.name,
            );
            playlistTracks.push(...tracks);
        }
        console.log(`  Got ${playlistTracks.length} total playlist tracks`);

        return {
            recentlyPlayed,
            playlistTracks,
            exportedAt: new Date().toISOString(),
        };
    }

    /** Export the full Spotify dump to a JSON file. */
    async exportToJson(outputPath: string): Promise<SpotifyDump> {
        const dump = await this.fetchAll();
        await writeFile(outputPath, JSON.stringify(dump, null, 2));
        console.log(`\nSpotify data exported to ${outputPath}`);
        return dump;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
