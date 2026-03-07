import { writeFile } from "node:fs/promises";
import { SpotifyAuth } from "./spotify-auth.js";
import type { RawSpotifyRecentTrack, RawSpotifyPlaylistTrack } from "../graph/build-graph.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export type SpotifyDump = {
    recentlyPlayed: RawSpotifyRecentTrack[];
    playlistTracks: RawSpotifyPlaylistTrack[];
    exportedAt: string;
};

export class SpotifyClient {
    private readonly auth: SpotifyAuth;

    constructor(auth: SpotifyAuth) {
        this.auth = auth;
    }

    async request<T>(url: string): Promise<T> {
        const maxRetries = 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const accessToken = await this.auth.getAccessToken();
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get("Retry-After") ?? "5", 10);
                if (attempt < maxRetries) {
                    console.log(`Rate limited. Waiting ${retryAfter}s before retry (${attempt + 1}/${maxRetries})...`);
                    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }
                throw new Error(`Spotify API rate limited after ${maxRetries} retries`);
            }

            if (response.status === 401) {
                if (attempt < maxRetries) {
                    await this.auth.refreshAccessToken();
                    continue;
                }
                throw new Error("Spotify API authentication failed after retry");
            }

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Spotify API error (${response.status}): ${body}`);
            }

            return (await response.json()) as T;
        }

        throw new Error("Spotify API request failed after all retries");
    }

    async getRecentlyPlayed(): Promise<RawSpotifyRecentTrack[]> {
        const data = await this.request<{
            items: Array<{
                track: {
                    id: string;
                    name: string;
                    artists: Array<{ name: string }>;
                    album: { name: string; images?: Array<{ url: string; height: number | null }> };
                    type: string;
                };
                played_at: string;
            }>;
        }>(`${SPOTIFY_API_BASE}/me/player/recently-played?limit=50`);

        return data.items
            .filter((item) => item.track.type === "track")
            .map((item) => {
                const images = item.track.album.images;
                const medium = images?.find((img) => img.height && img.height >= 200 && img.height <= 400);
                const imageUrl = (medium ?? images?.[0])?.url;

                return {
                    spotifyId: item.track.id,
                    artist: item.track.artists.map((a) => a.name).join(", "),
                    track: item.track.name,
                    album: item.track.album.name,
                    playedAt: item.played_at,
                    imageUrl,
                };
            });
    }

    async getAllPlaylists(): Promise<Array<{ id: string; name: string; tracks: { total: number } }>> {
        type PlaylistItem = { id: string; name: string; tracks: { total: number } };
        type PlaylistResponse = { items: PlaylistItem[]; next: string | null };

        const playlists: PlaylistItem[] = [];
        let nextUrl: string | null = `${SPOTIFY_API_BASE}/me/playlists?limit=50&offset=0`;

        while (nextUrl !== null) {
            const data: PlaylistResponse = await this.request(nextUrl);
            playlists.push(...data.items);
            nextUrl = data.next;
        }

        return playlists;
    }

    async getPlaylistTracks(playlistId: string, playlistName: string): Promise<RawSpotifyPlaylistTrack[]> {
        type TrackImage = { url: string; height: number | null };
        type TrackObject = {
            id: string;
            name: string;
            artists: Array<{ name: string }>;
            album: { name: string; images?: TrackImage[] };
            is_local: boolean;
            type: string;
        };
        type TracksResponse = { items: Array<{ track: TrackObject | null }>; next: string | null };

        const tracks: RawSpotifyPlaylistTrack[] = [];
        let nextUrl: string | null = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100&offset=0`;
        let position = 0;

        while (nextUrl !== null) {
            const data: TracksResponse = await this.request(nextUrl);

            for (const item of data.items) {
                if (!item.track) {
                    position++;
                    continue;
                }
                if (item.track.type !== "track") {
                    position++;
                    continue;
                }

                const images = item.track.album.images;
                const medium = images?.find((img: TrackImage) => img.height && img.height >= 200 && img.height <= 400);
                const imageUrl = (medium ?? images?.[0])?.url;

                tracks.push({
                    spotifyId: item.track.is_local ? "" : item.track.id,
                    artist: item.track.artists.map((a: { name: string }) => a.name).join(", "),
                    track: item.track.name,
                    album: item.track.album.name,
                    playlistId,
                    playlistName,
                    position,
                    imageUrl,
                });

                position++;
            }

            nextUrl = data.next;
        }

        return tracks;
    }

    async fetchAll(): Promise<SpotifyDump> {
        console.log("Fetching recently played tracks...");
        const recentlyPlayed = await this.getRecentlyPlayed();
        console.log(`  Got ${recentlyPlayed.length} recently played tracks`);

        console.log("Fetching playlists...");
        const playlists = await this.getAllPlaylists();
        console.log(`  Found ${playlists.length} playlists`);

        const playlistTracks: RawSpotifyPlaylistTrack[] = [];
        for (const playlist of playlists) {
            console.log(`  Fetching tracks for "${playlist.name}" (${playlist.tracks.total} tracks)...`);
            const tracks = await this.getPlaylistTracks(playlist.id, playlist.name);
            playlistTracks.push(...tracks);
        }
        console.log(`  Got ${playlistTracks.length} total playlist tracks`);

        return {
            recentlyPlayed,
            playlistTracks,
            exportedAt: new Date().toISOString(),
        };
    }

    async exportToJson(outputPath: string, existingDump?: SpotifyDump): Promise<SpotifyDump> {
        const dump = existingDump ?? (await this.fetchAll());
        await writeFile(outputPath, JSON.stringify(dump, null, 2));
        console.log(`\nSpotify data exported to ${outputPath}`);
        return dump;
    }
}
