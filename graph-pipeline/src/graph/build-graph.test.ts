import { describe, it, expect, vi, afterEach } from "vitest";
import { buildGraph, type GraphInput } from "./build-graph.js";
import type { SongKey } from "./types.js";
import type { RawScrobble } from "../ingestion/types.js";
import type {
    RawSpotifyRecentTrack,
    RawSpotifyPlaylistTrack,
} from "../ingestion/types.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("buildGraph", () => {
    describe("Last.fm scrobbles", () => {
        it("creates nodes from scrobbles", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "Artist A", track: "Track 1", album: "Album 1", timestamp: 1000 },
                    { artist: "Artist B", track: "Track 2", album: "Album 2", timestamp: 2000 },
                ],
            };

            const graph = buildGraph(input);

            expect(Object.keys(graph.nodes)).toHaveLength(2);
            expect(graph.nodes["artist a::track 1" as SongKey]).toBeDefined();
            expect(graph.nodes["artist b::track 2" as SongKey]).toBeDefined();
        });

        it("creates edges from consecutive scrobbles", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                    { artist: "C", track: "T3", album: "", timestamp: 3000 },
                ],
            };

            const graph = buildGraph(input);
            const nodeA = graph.nodes["a::t1" as SongKey]!;
            const nodeB = graph.nodes["b::t2" as SongKey]!;
            const nodeC = graph.nodes["c::t3" as SongKey]!;

            // A -> B edge
            expect(nodeA.next["b::t2" as SongKey]).toBe(1);
            expect(nodeB.previous["a::t1" as SongKey]).toBe(1);

            // B -> C edge
            expect(nodeB.next["c::t3" as SongKey]).toBe(1);
            expect(nodeC.previous["b::t2" as SongKey]).toBe(1);

            // No A -> C edge
            expect(nodeA.next["c::t3" as SongKey]).toBeUndefined();
        });

        it("accumulates edge weights for repeated transitions", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                    { artist: "A", track: "T1", album: "", timestamp: 3000 },
                    { artist: "B", track: "T2", album: "", timestamp: 4000 },
                ],
            };

            const graph = buildGraph(input);
            const nodeA = graph.nodes["a::t1" as SongKey]!;

            // A -> B happened twice
            expect(nodeA.next["b::t2" as SongKey]).toBe(2);
        });

        it("sorts scrobbles chronologically before building edges", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "C", track: "T3", album: "", timestamp: 3000 },
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                ],
            };

            const graph = buildGraph(input);
            const nodeA = graph.nodes["a::t1" as SongKey]!;

            // After sorting: A -> B -> C
            expect(nodeA.next["b::t2" as SongKey]).toBe(1);
            expect(nodeA.next["c::t3" as SongKey]).toBeUndefined();
        });

        it("counts totalPlays per node", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                    { artist: "A", track: "T1", album: "", timestamp: 3000 },
                ],
            };

            const graph = buildGraph(input);
            expect(graph.nodes["a::t1" as SongKey]!.totalPlays).toBe(2);
            expect(graph.nodes["b::t2" as SongKey]!.totalPlays).toBe(1);
        });

        it("sets source to lastfm", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                ],
            };

            const graph = buildGraph(input);
            expect(graph.nodes["a::t1" as SongKey]!.sources).toEqual(["lastfm"]);
        });

        it("skips tracks with missing artist or name", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "", track: "T1", album: "", timestamp: 1000 },
                    { artist: "A", track: "", album: "", timestamp: 2000 },
                    { artist: "B", track: "T2", album: "", timestamp: 3000 },
                ],
            };

            const graph = buildGraph(input);
            expect(Object.keys(graph.nodes)).toHaveLength(1);
        });
    });

    describe("Spotify recent tracks", () => {
        it("creates nodes and edges from recent tracks", () => {
            const input: GraphInput = {
                spotifyRecentTracks: [
                    { spotifyId: "s1", artist: "A", track: "T1", album: "Al1", playedAt: "2024-01-01T00:00:00Z" },
                    { spotifyId: "s2", artist: "B", track: "T2", album: "Al2", playedAt: "2024-01-01T00:05:00Z" },
                ],
            };

            const graph = buildGraph(input);

            expect(Object.keys(graph.nodes)).toHaveLength(2);
            const nodeA = graph.nodes["a::t1" as SongKey]!;
            expect(nodeA.next["b::t2" as SongKey]).toBe(1);
            expect(nodeA.spotifyId).toBe("s1");
            expect(nodeA.sources).toEqual(["spotify-recent"]);
        });

        it("sorts by playedAt before building edges", () => {
            const input: GraphInput = {
                spotifyRecentTracks: [
                    { spotifyId: "s2", artist: "B", track: "T2", album: "", playedAt: "2024-01-01T00:10:00Z" },
                    { spotifyId: "s1", artist: "A", track: "T1", album: "", playedAt: "2024-01-01T00:00:00Z" },
                ],
            };

            const graph = buildGraph(input);
            const nodeA = graph.nodes["a::t1" as SongKey]!;
            expect(nodeA.next["b::t2" as SongKey]).toBe(1);
        });
    });

    describe("Spotify playlist tracks", () => {
        it("creates edges from playlist track ordering", () => {
            const input: GraphInput = {
                spotifyPlaylistTracks: [
                    { spotifyId: "s1", artist: "A", track: "T1", album: "", playlistName: "My Playlist", position: 0 },
                    { spotifyId: "s2", artist: "B", track: "T2", album: "", playlistName: "My Playlist", position: 1 },
                    { spotifyId: "s3", artist: "C", track: "T3", album: "", playlistName: "My Playlist", position: 2 },
                ],
            };

            const graph = buildGraph(input);
            const nodeA = graph.nodes["a::t1" as SongKey]!;
            const nodeB = graph.nodes["b::t2" as SongKey]!;

            expect(nodeA.next["b::t2" as SongKey]).toBe(1);
            expect(nodeB.next["c::t3" as SongKey]).toBe(1);
            expect(nodeA.sources).toEqual(["spotify-playlist"]);
        });

        it("processes multiple playlists independently", () => {
            const input: GraphInput = {
                spotifyPlaylistTracks: [
                    { spotifyId: "s1", artist: "A", track: "T1", album: "", playlistName: "Playlist 1", position: 0 },
                    { spotifyId: "s2", artist: "B", track: "T2", album: "", playlistName: "Playlist 1", position: 1 },
                    { spotifyId: "s3", artist: "C", track: "T3", album: "", playlistName: "Playlist 2", position: 0 },
                    { spotifyId: "s4", artist: "D", track: "T4", album: "", playlistName: "Playlist 2", position: 1 },
                ],
            };

            const graph = buildGraph(input);
            const nodeA = graph.nodes["a::t1" as SongKey]!;
            const nodeC = graph.nodes["c::t3" as SongKey]!;

            // Playlist 1: A -> B
            expect(nodeA.next["b::t2" as SongKey]).toBe(1);
            // Playlist 2: C -> D
            expect(nodeC.next["d::t4" as SongKey]).toBe(1);
            // No cross-playlist edge A -> C
            expect(nodeA.next["c::t3" as SongKey]).toBeUndefined();
        });
    });

    describe("cross-source merging", () => {
        it("merges the same song from multiple sources", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "Artist A", track: "Track 1", album: "Album 1", timestamp: 1000 },
                ],
                spotifyRecentTracks: [
                    { spotifyId: "s1", artist: "Artist A", track: "Track 1", album: "Album 1", playedAt: "2024-01-01T00:00:00Z" },
                ],
            };

            const graph = buildGraph(input);

            // Same SongKey — should be one node
            expect(Object.keys(graph.nodes)).toHaveLength(1);
            const node = graph.nodes["artist a::track 1" as SongKey]!;
            expect(node.totalPlays).toBe(2);
            expect(node.sources).toContain("lastfm");
            expect(node.sources).toContain("spotify-recent");
            expect(node.spotifyId).toBe("s1");
        });

        it("sums edge weights across sources", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                ],
                spotifyRecentTracks: [
                    { spotifyId: "s1", artist: "A", track: "T1", album: "", playedAt: "2024-01-02T00:00:00Z" },
                    { spotifyId: "s2", artist: "B", track: "T2", album: "", playedAt: "2024-01-02T00:05:00Z" },
                ],
            };

            const graph = buildGraph(input);
            const nodeA = graph.nodes["a::t1" as SongKey]!;

            // A -> B from both sources
            expect(nodeA.next["b::t2" as SongKey]).toBe(2);
        });
    });

    describe("edge cases", () => {
        it("handles empty input", () => {
            const graph = buildGraph({});

            expect(Object.keys(graph.nodes)).toHaveLength(0);
            expect(graph.metadata.totalScrobbles).toBe(0);
        });

        it("handles single-track session (no edges)", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                ],
            };

            const graph = buildGraph(input);
            const node = graph.nodes["a::t1" as SongKey]!;

            expect(Object.keys(node.next)).toHaveLength(0);
            expect(Object.keys(node.previous)).toHaveLength(0);
            expect(node.totalPlays).toBe(1);
        });

        it("handles single-track playlist (no edges)", () => {
            const input: GraphInput = {
                spotifyPlaylistTracks: [
                    { spotifyId: "s1", artist: "A", track: "T1", album: "", playlistName: "Solo", position: 0 },
                ],
            };

            const graph = buildGraph(input);
            const node = graph.nodes["a::t1" as SongKey]!;
            expect(Object.keys(node.next)).toHaveLength(0);
        });
    });

    describe("metadata", () => {
        it("computes totalScrobbles across all sources", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                ],
                spotifyRecentTracks: [
                    { spotifyId: "s1", artist: "C", track: "T3", album: "", playedAt: "2024-01-01T00:00:00Z" },
                ],
                spotifyPlaylistTracks: [
                    { spotifyId: "s2", artist: "D", track: "T4", album: "", playlistName: "P", position: 0 },
                ],
            };

            const graph = buildGraph(input);
            expect(graph.metadata.totalScrobbles).toBe(4);
        });

        it("computes date range from timestamps", () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1704067200 }, // 2024-01-01
                    { artist: "B", track: "T2", album: "", timestamp: 1706745600 }, // 2024-02-01
                ],
            };

            const graph = buildGraph(input);
            expect(graph.metadata.dateRange.from).toBe("2024-01-01T00:00:00.000Z");
            expect(graph.metadata.dateRange.to).toBe("2024-02-01T00:00:00.000Z");
            expect(graph.metadata.exportTimestamp).toBe("2024-06-01T00:00:00.000Z");

            vi.useRealTimers();
        });

        it("includes usernames when provided", () => {
            const graph = buildGraph({
                lastfmUsername: "myuser",
                spotifyUsername: "myspotify",
            });

            expect(graph.metadata.lastfmUsername).toBe("myuser");
            expect(graph.metadata.spotifyUsername).toBe("myspotify");
        });
    });

    describe("normalization", () => {
        it("matches songs case-insensitively", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "Artist A", track: "Track 1", album: "", timestamp: 1000 },
                    { artist: "ARTIST A", track: "TRACK 1", album: "", timestamp: 2000 },
                    { artist: "artist a", track: "track 1", album: "", timestamp: 3000 },
                ],
            };

            const graph = buildGraph(input);

            // All three should merge into one node
            expect(Object.keys(graph.nodes)).toHaveLength(1);
            const node = graph.nodes["artist a::track 1" as SongKey]!;
            expect(node.totalPlays).toBe(3);
        });
    });
});
