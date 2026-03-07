import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpotifyClient, type SpotifyDump } from "../../../graph-server/src/ingestion/spotify-client.js";
import { SpotifyAuth } from "../../../graph-server/src/ingestion/spotify-auth.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync } from "node:fs";

const TEST_CONFIG = {
    clientId: "test-id",
    clientSecret: "test-secret",
    redirectPort: 9999,
};

async function createClient() {
    const tmpDir = mkdtempSync(join(tmpdir(), "spotify-client-test-"));
    const auth = new SpotifyAuth({
        config: TEST_CONFIG,
        tokenPath: join(tmpDir, ".tokens.json"),
    });
    // Seed valid tokens so getAccessToken() works
    await auth.saveTokens({
        access_token: "test-token",
        refresh_token: "test-refresh",
        expires_at: Date.now() + 3600_000,
        scope: "user-read-recently-played",
    });
    return new SpotifyClient(auth);
}

/** Helper to create a mock fetch that returns different responses per URL pattern. */
function mockFetchResponses(
    handlers: Array<{
        match: string | RegExp;
        response: unknown;
        status?: number;
    }>,
) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        for (const handler of handlers) {
            const matches =
                typeof handler.match === "string"
                    ? url.includes(handler.match)
                    : handler.match.test(url);
            if (matches) {
                return new Response(JSON.stringify(handler.response), {
                    status: handler.status ?? 200,
                });
            }
        }
        return new Response("Not found", { status: 404 });
    });
}

describe("SpotifyClient", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("getRecentlyPlayed", () => {
        it("fetches and maps recently played tracks", async () => {
            mockFetchResponses([
                {
                    match: "recently-played",
                    response: {
                        items: [
                            {
                                track: {
                                    id: "abc123",
                                    name: "Song A",
                                    artists: [{ name: "Artist 1" }],
                                    album: { name: "Album X" },
                                    is_local: false,
                                    type: "track",
                                },
                                played_at: "2025-01-15T10:00:00Z",
                            },
                            {
                                track: {
                                    id: "def456",
                                    name: "Song B",
                                    artists: [
                                        { name: "Artist 2" },
                                        { name: "Artist 3" },
                                    ],
                                    album: { name: "Album Y" },
                                    is_local: false,
                                    type: "track",
                                },
                                played_at: "2025-01-15T09:55:00Z",
                            },
                        ],
                        next: null,
                    },
                },
            ]);

            const client = await createClient();
            const tracks = await client.getRecentlyPlayed();

            expect(tracks).toHaveLength(2);
            expect(tracks[0]).toEqual({
                spotifyId: "abc123",
                artist: "Artist 1",
                track: "Song A",
                album: "Album X",
                playedAt: "2025-01-15T10:00:00Z",
            });
            expect(tracks[1]!.artist).toBe("Artist 2, Artist 3");
        });

        it("filters out podcast episodes", async () => {
            mockFetchResponses([
                {
                    match: "recently-played",
                    response: {
                        items: [
                            {
                                track: {
                                    id: "track1",
                                    name: "Real Song",
                                    artists: [{ name: "Artist" }],
                                    album: { name: "Album" },
                                    is_local: false,
                                    type: "track",
                                },
                                played_at: "2025-01-15T10:00:00Z",
                            },
                            {
                                track: {
                                    id: "ep1",
                                    name: "Podcast Episode",
                                    artists: [{ name: "Host" }],
                                    album: { name: "Podcast" },
                                    is_local: false,
                                    type: "episode",
                                },
                                played_at: "2025-01-15T09:00:00Z",
                            },
                        ],
                        next: null,
                    },
                },
            ]);

            const client = await createClient();
            const tracks = await client.getRecentlyPlayed();
            expect(tracks).toHaveLength(1);
            expect(tracks[0]!.track).toBe("Real Song");
        });
    });

    describe("getAllPlaylists", () => {
        it("paginates through all playlists", async () => {
            mockFetchResponses([
                {
                    match: "me/playlists?limit=50&offset=0",
                    response: {
                        items: [
                            {
                                id: "pl1",
                                name: "Playlist 1",
                                tracks: { total: 10 },
                            },
                            {
                                id: "pl2",
                                name: "Playlist 2",
                                tracks: { total: 5 },
                            },
                        ],
                        next: "https://api.spotify.com/v1/me/playlists?limit=50&offset=2",
                        total: 3,
                        limit: 50,
                        offset: 0,
                    },
                },
                {
                    match: "offset=2",
                    response: {
                        items: [
                            {
                                id: "pl3",
                                name: "Playlist 3",
                                tracks: { total: 20 },
                            },
                        ],
                        next: null,
                        total: 3,
                        limit: 50,
                        offset: 2,
                    },
                },
            ]);

            const client = await createClient();
            const playlists = await client.getAllPlaylists();

            expect(playlists).toHaveLength(3);
            expect(playlists.map((p) => p.id)).toEqual(["pl1", "pl2", "pl3"]);
        });
    });

    describe("getPlaylistTracks", () => {
        it("fetches tracks with correct position and handles edge cases", async () => {
            mockFetchResponses([
                {
                    match: "playlists/pl1/tracks",
                    response: {
                        items: [
                            {
                                track: {
                                    id: "t1",
                                    name: "Track 1",
                                    artists: [{ name: "Artist A" }],
                                    album: { name: "Album 1" },
                                    is_local: false,
                                    type: "track",
                                },
                                is_local: false,
                            },
                            {
                                track: null, // Removed track
                                is_local: false,
                            },
                            {
                                track: {
                                    id: "ep1",
                                    name: "Episode",
                                    artists: [{ name: "Host" }],
                                    album: { name: "Podcast" },
                                    is_local: false,
                                    type: "episode",
                                },
                                is_local: false,
                            },
                            {
                                track: {
                                    id: "",
                                    name: "Local Song",
                                    artists: [{ name: "Local Artist" }],
                                    album: { name: "Local Album" },
                                    is_local: true,
                                    type: "track",
                                },
                                is_local: true,
                            },
                        ],
                        next: null,
                        total: 4,
                        limit: 100,
                        offset: 0,
                    },
                },
            ]);

            const client = await createClient();
            const tracks = await client.getPlaylistTracks("pl1", "My Playlist");

            // Should have 2 tracks: Track 1 and Local Song (null and episode filtered)
            expect(tracks).toHaveLength(2);

            expect(tracks[0]).toEqual({
                spotifyId: "t1",
                artist: "Artist A",
                track: "Track 1",
                album: "Album 1",
                playlistId: "pl1",
                playlistName: "My Playlist",
                position: 0,
            });

            // Local file should have empty spotifyId
            expect(tracks[1]).toEqual({
                spotifyId: "",
                artist: "Local Artist",
                track: "Local Song",
                album: "Local Album",
                playlistId: "pl1",
                playlistName: "My Playlist",
                position: 3,
            });
        });

        it("handles empty playlists", async () => {
            mockFetchResponses([
                {
                    match: "playlists/empty/tracks",
                    response: {
                        items: [],
                        next: null,
                        total: 0,
                        limit: 100,
                        offset: 0,
                    },
                },
            ]);

            const client = await createClient();
            const tracks = await client.getPlaylistTracks(
                "empty",
                "Empty Playlist",
            );
            expect(tracks).toHaveLength(0);
        });
    });

    describe("rate limiting", () => {
        it("retries on 429 with Retry-After header", async () => {
            let callCount = 0;
            vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    return new Response("Rate limited", {
                        status: 429,
                        headers: { "Retry-After": "0" },
                    });
                }
                return new Response(
                    JSON.stringify({
                        items: [],
                        next: null,
                    }),
                    { status: 200 },
                );
            });

            const client = await createClient();
            const tracks = await client.getRecentlyPlayed();

            expect(tracks).toHaveLength(0);
            expect(callCount).toBe(2);
        });

        it("throws after max retries on persistent 429", async () => {
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async () =>
                    new Response("Rate limited", {
                        status: 429,
                        headers: { "Retry-After": "0" },
                    }),
            );

            const client = await createClient();
            await expect(client.getRecentlyPlayed()).rejects.toThrow(
                "rate limited",
            );
        });
    });

    describe("exportToJson", () => {
        it("uses provided dump without calling fetchAll", async () => {
            const fetchSpy = vi.spyOn(globalThis, "fetch");

            const dump: SpotifyDump = {
                recentlyPlayed: [
                    {
                        spotifyId: "r1",
                        artist: "Artist",
                        track: "Track",
                        album: "Album",
                        playedAt: "2025-01-15T10:00:00Z",
                    },
                ],
                playlistTracks: [],
                exportedAt: "2025-01-15T12:00:00Z",
            };

            const tmpDir = mkdtempSync(join(tmpdir(), "export-test-"));
            const outPath = join(tmpDir, "dump.json");

            const client = await createClient();
            const consoleSpy = vi
                .spyOn(console, "log")
                .mockImplementation(() => {});
            const result = await client.exportToJson(outPath, dump);
            consoleSpy.mockRestore();

            expect(fetchSpy).not.toHaveBeenCalled();
            expect(result).toEqual(dump);

            const written = JSON.parse(readFileSync(outPath, "utf-8"));
            expect(written.recentlyPlayed).toHaveLength(1);
            expect(written.recentlyPlayed[0].track).toBe("Track");
        });
    });

    describe("fetchAll", () => {
        it("combines recently played and playlist tracks", async () => {
            const consoleSpy = vi
                .spyOn(console, "log")
                .mockImplementation(() => {});

            mockFetchResponses([
                {
                    match: "recently-played",
                    response: {
                        items: [
                            {
                                track: {
                                    id: "r1",
                                    name: "Recent Track",
                                    artists: [{ name: "Artist" }],
                                    album: { name: "Album" },
                                    is_local: false,
                                    type: "track",
                                },
                                played_at: "2025-01-15T10:00:00Z",
                            },
                        ],
                        next: null,
                    },
                },
                {
                    match: "me/playlists",
                    response: {
                        items: [
                            {
                                id: "pl1",
                                name: "My Playlist",
                                tracks: { total: 1 },
                            },
                        ],
                        next: null,
                        total: 1,
                        limit: 50,
                        offset: 0,
                    },
                },
                {
                    match: "playlists/pl1/tracks",
                    response: {
                        items: [
                            {
                                track: {
                                    id: "pt1",
                                    name: "Playlist Track",
                                    artists: [{ name: "Artist 2" }],
                                    album: { name: "Album 2" },
                                    is_local: false,
                                    type: "track",
                                },
                                is_local: false,
                            },
                        ],
                        next: null,
                        total: 1,
                        limit: 100,
                        offset: 0,
                    },
                },
            ]);

            const client = await createClient();
            const dump = await client.fetchAll();

            expect(dump.recentlyPlayed).toHaveLength(1);
            expect(dump.recentlyPlayed[0]!.track).toBe("Recent Track");
            expect(dump.playlistTracks).toHaveLength(1);
            expect(dump.playlistTracks[0]!.track).toBe("Playlist Track");
            expect(dump.exportedAt).toBeDefined();

            consoleSpy.mockRestore();
        });
    });
});
