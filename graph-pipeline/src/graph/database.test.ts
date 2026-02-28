import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "./database.js";
import type { ListeningGraph, SongKey } from "./types.js";
import { toSongKey } from "./types.js";

function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), "graph-db-test-"));
}

function makeTestGraph(): ListeningGraph {
    const keyA = toSongKey("Artist A", "Track 1");
    const keyB = toSongKey("Artist B", "Track 2");
    const keyC = toSongKey("Artist A", "Track 3");

    return {
        nodes: {
            [keyA]: {
                name: "Track 1",
                artists: ["Artist A"],
                albumName: "Album 1",
                spotifyId: "sp-123",
                next: { [keyB]: 3 } as Record<SongKey, number>,
                previous: {} as Record<SongKey, number>,
                totalPlays: 5,
                sources: ["lastfm", "spotify-recent"],
            },
            [keyB]: {
                name: "Track 2",
                artists: ["Artist B"],
                albumName: "Album 2",
                lastfmUrl: "https://last.fm/track/2",
                next: { [keyC]: 1 } as Record<SongKey, number>,
                previous: { [keyA]: 3 } as Record<SongKey, number>,
                totalPlays: 3,
                sources: ["lastfm"],
            },
            [keyC]: {
                name: "Track 3",
                artists: ["Artist A"],
                next: {} as Record<SongKey, number>,
                previous: { [keyB]: 1 } as Record<SongKey, number>,
                totalPlays: 1,
                sources: ["spotify-playlist"],
            },
        } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
        metadata: {
            totalScrobbles: 9,
            dateRange: {
                from: "2024-01-01T00:00:00Z",
                to: "2024-12-31T00:00:00Z",
            },
            exportTimestamp: "2025-01-15T12:00:00Z",
            lastfmUsername: "testuser",
            spotifyUsername: "spotifyuser",
        },
    };
}

describe("GraphDatabase", () => {
    let tmpDir: string;
    let db: GraphDatabase;

    beforeEach(() => {
        tmpDir = makeTmpDir();
        db = new GraphDatabase(join(tmpDir, "test.db"));
    });

    afterEach(() => {
        db.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("round-trips a graph: save → load → matches original", () => {
        const original = makeTestGraph();
        db.saveGraph(original);
        const loaded = db.loadGraph();

        // Compare nodes
        const origKeys = Object.keys(original.nodes).sort();
        const loadedKeys = Object.keys(loaded.nodes).sort();
        expect(loadedKeys).toEqual(origKeys);

        for (const key of origKeys) {
            const sk = key as SongKey;
            const origNode = original.nodes[sk]!;
            const loadedNode = loaded.nodes[sk]!;

            expect(loadedNode.name).toBe(origNode.name);
            expect(loadedNode.artists).toEqual(origNode.artists);
            expect(loadedNode.albumName).toBe(origNode.albumName);
            expect(loadedNode.spotifyId).toBe(origNode.spotifyId);
            expect(loadedNode.lastfmUrl).toBe(origNode.lastfmUrl);
            expect(loadedNode.totalPlays).toBe(origNode.totalPlays);
            expect(loadedNode.sources.sort()).toEqual(
                [...origNode.sources].sort(),
            );
            expect(loadedNode.next).toEqual(origNode.next);
            expect(loadedNode.previous).toEqual(origNode.previous);
        }

        // Compare metadata
        expect(loaded.metadata.totalScrobbles).toBe(
            original.metadata.totalScrobbles,
        );
        expect(loaded.metadata.dateRange).toEqual(original.metadata.dateRange);
        expect(loaded.metadata.exportTimestamp).toBe(
            original.metadata.exportTimestamp,
        );
        expect(loaded.metadata.lastfmUsername).toBe(
            original.metadata.lastfmUsername,
        );
        expect(loaded.metadata.spotifyUsername).toBe(
            original.metadata.spotifyUsername,
        );
    });

    it("supports incremental updates — merges edge weights and play counts", () => {
        const keyA = toSongKey("Artist A", "Track 1");
        const keyB = toSongKey("Artist B", "Track 2");

        // First insert
        const graph1: ListeningGraph = {
            nodes: {
                [keyA]: {
                    name: "Track 1",
                    artists: ["Artist A"],
                    next: { [keyB]: 2 } as Record<SongKey, number>,
                    previous: {} as Record<SongKey, number>,
                    totalPlays: 3,
                    sources: ["lastfm"],
                },
                [keyB]: {
                    name: "Track 2",
                    artists: ["Artist B"],
                    next: {} as Record<SongKey, number>,
                    previous: { [keyA]: 2 } as Record<SongKey, number>,
                    totalPlays: 2,
                    sources: ["lastfm"],
                },
            } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 5,
                dateRange: {
                    from: "2024-01-01T00:00:00Z",
                    to: "2024-06-01T00:00:00Z",
                },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        db.saveGraph(graph1);

        // Second insert — adds more plays and a new source
        const graph2: ListeningGraph = {
            nodes: {
                [keyA]: {
                    name: "Track 1",
                    artists: ["Artist A"],
                    next: { [keyB]: 1 } as Record<SongKey, number>,
                    previous: {} as Record<SongKey, number>,
                    totalPlays: 2,
                    sources: ["spotify-recent"],
                },
                [keyB]: {
                    name: "Track 2",
                    artists: ["Artist B"],
                    next: {} as Record<SongKey, number>,
                    previous: { [keyA]: 1 } as Record<SongKey, number>,
                    totalPlays: 1,
                    sources: ["spotify-recent"],
                },
            } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 3,
                dateRange: {
                    from: "2024-06-01T00:00:00Z",
                    to: "2024-12-01T00:00:00Z",
                },
                exportTimestamp: "2025-02-01T00:00:00Z",
            },
        };

        db.saveGraph(graph2);

        const loaded = db.loadGraph();

        // Play counts should be summed
        expect(loaded.nodes[keyA]!.totalPlays).toBe(5); // 3 + 2
        expect(loaded.nodes[keyB]!.totalPlays).toBe(3); // 2 + 1

        // Edge weights should be summed
        expect(loaded.nodes[keyA]!.next[keyB]).toBe(3); // 2 + 1

        // Sources should be merged
        expect(loaded.nodes[keyA]!.sources.sort()).toEqual(
            ["lastfm", "spotify-recent"].sort(),
        );

        // Metadata should reflect latest export
        expect(loaded.metadata.exportTimestamp).toBe("2025-02-01T00:00:00Z");
    });

    it("getNode returns a single node with edges", () => {
        const graph = makeTestGraph();
        db.saveGraph(graph);

        const keyA = toSongKey("Artist A", "Track 1");
        const keyB = toSongKey("Artist B", "Track 2");

        const node = db.getNode(keyA);
        expect(node).not.toBeNull();
        expect(node!.name).toBe("Track 1");
        expect(node!.next[keyB]).toBe(3);
    });

    it("getNode returns null for nonexistent key", () => {
        const node = db.getNode("nonexistent::key" as SongKey);
        expect(node).toBeNull();
    });

    it("getNodeCount and getEdgeCount", () => {
        const graph = makeTestGraph();
        db.saveGraph(graph);

        expect(db.getNodeCount()).toBe(3);
        expect(db.getEdgeCount()).toBe(2); // A→B, B→C
    });

    it("clearGraph + saveGraph is idempotent — repeated saves produce identical data", () => {
        const graph = makeTestGraph();
        const keyA = toSongKey("Artist A", "Track 1");
        const keyB = toSongKey("Artist B", "Track 2");

        // Save once
        db.clearGraph();
        db.saveGraph(graph);
        const first = db.loadGraph();

        // Save again with clear — should be identical
        db.clearGraph();
        db.saveGraph(graph);
        const second = db.loadGraph();

        expect(db.getNodeCount()).toBe(Object.keys(graph.nodes).length);
        expect(db.getEdgeCount()).toBe(2);
        expect(second.nodes[keyA]!.totalPlays).toBe(first.nodes[keyA]!.totalPlays);
        expect(second.nodes[keyB]!.totalPlays).toBe(first.nodes[keyB]!.totalPlays);
        expect(second.nodes[keyA]!.next[keyB]).toBe(first.nodes[keyA]!.next[keyB]);
    });

    it("handles empty graph", () => {
        const empty: ListeningGraph = {
            nodes: {} as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 0,
                dateRange: { from: "", to: "" },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        db.saveGraph(empty);
        const loaded = db.loadGraph();

        expect(Object.keys(loaded.nodes)).toHaveLength(0);
        expect(loaded.metadata.totalScrobbles).toBe(0);
    });
});
