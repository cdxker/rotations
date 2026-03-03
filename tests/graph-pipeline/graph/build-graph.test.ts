import { describe, it, expect, vi, afterEach } from "vitest";
import { buildGraph, type GraphInput } from "../../../graph-pipeline/src/graph/build-graph.js";
import type { SongKey } from "../../../graph-pipeline/src/graph/types.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("buildGraph", () => {
    describe("Last.fm scrobbles", () => {
        it("creates nodes from scrobbles", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    {
                        artist: "Artist A",
                        track: "Track 1",
                        album: "Album 1",
                        timestamp: 1000,
                    },
                    {
                        artist: "Artist B",
                        track: "Track 2",
                        album: "Album 2",
                        timestamp: 2000,
                    },
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

        it("creates individual timestamped edge events", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                ],
            };

            const graph = buildGraph(input);

            expect(graph.edges).toHaveLength(1);
            expect(graph.edges[0]!.from).toBe("a::t1");
            expect(graph.edges[0]!.to).toBe("b::t2");
            expect(graph.edges[0]!.timestamp).toBe(
                new Date(1000 * 1000).toISOString(),
            );
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
            // Two individual edge events for A -> B
            const abEdges = graph.edges.filter(
                (e) => e.from === "a::t1" && e.to === "b::t2",
            );
            expect(abEdges).toHaveLength(2);
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

        it("does not create edges when gap exceeds 1 hour", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    {
                        artist: "B",
                        track: "T2",
                        album: "",
                        timestamp: 1000 + 3601,
                    }, // > 1 hour gap
                ],
            };

            const graph = buildGraph(input);
            expect(graph.edges).toHaveLength(0);
            expect(
                graph.nodes["a::t1" as SongKey]!.next["b::t2" as SongKey],
            ).toBeUndefined();
        });
    });

    describe("edge cases", () => {
        it("handles empty input", () => {
            const graph = buildGraph({});

            expect(Object.keys(graph.nodes)).toHaveLength(0);
            expect(graph.edges).toHaveLength(0);
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
            expect(graph.edges).toHaveLength(0);
        });
    });

    describe("metadata", () => {
        it("computes totalScrobbles", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    { artist: "A", track: "T1", album: "", timestamp: 1000 },
                    { artist: "B", track: "T2", album: "", timestamp: 2000 },
                ],
            };

            const graph = buildGraph(input);
            expect(graph.metadata.totalScrobbles).toBe(2);
        });

        it("computes date range from timestamps", () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

            const input: GraphInput = {
                lastfmScrobbles: [
                    {
                        artist: "A",
                        track: "T1",
                        album: "",
                        timestamp: 1704067200,
                    }, // 2024-01-01
                    {
                        artist: "B",
                        track: "T2",
                        album: "",
                        timestamp: 1706745600,
                    }, // 2024-02-01
                ],
            };

            const graph = buildGraph(input);
            expect(graph.metadata.dateRange.from).toBe(
                "2024-01-01T00:00:00.000Z",
            );
            expect(graph.metadata.dateRange.to).toBe(
                "2024-02-01T00:00:00.000Z",
            );
            expect(graph.metadata.exportTimestamp).toBe(
                "2024-06-01T00:00:00.000Z",
            );

            vi.useRealTimers();
        });

        it("includes lastfmUsername when provided", () => {
            const graph = buildGraph({
                lastfmUsername: "myuser",
            });

            expect(graph.metadata.lastfmUsername).toBe("myuser");
        });
    });

    describe("normalization", () => {
        it("matches songs case-insensitively", () => {
            const input: GraphInput = {
                lastfmScrobbles: [
                    {
                        artist: "Artist A",
                        track: "Track 1",
                        album: "",
                        timestamp: 1000,
                    },
                    {
                        artist: "ARTIST A",
                        track: "TRACK 1",
                        album: "",
                        timestamp: 2000,
                    },
                    {
                        artist: "artist a",
                        track: "track 1",
                        album: "",
                        timestamp: 3000,
                    },
                ],
            };

            const graph = buildGraph(input);

            // All three should merge into one node
            expect(Object.keys(graph.nodes)).toHaveLength(1);
            const node = graph.nodes["artist a::track 1" as SongKey]!;
            expect(node.totalPlays).toBe(3);
        });
    });

    describe("large datasets", () => {
        it("handles 200k+ scrobbles without stack overflow", () => {
            const count = 200_000;
            const scrobbles = Array.from({ length: count }, (_, i) => ({
                artist: `Artist ${i % 100}`,
                track: `Track ${i % 100}`,
                album: "Album",
                timestamp: 1_700_000_000 + i,
            }));

            const graph = buildGraph({ lastfmScrobbles: scrobbles });

            expect(graph.metadata.dateRange.from).toBeTruthy();
            expect(graph.metadata.dateRange.to).toBeTruthy();
            expect(graph.metadata.totalScrobbles).toBe(count);
            expect(graph.edges.length).toBeGreaterThan(0);
        });
    });
});
