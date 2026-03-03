import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "../../../graph-pipeline/src/graph/database.js";
import type { ListeningGraph, SongKey, GraphEdge } from "../../../graph-pipeline/src/graph/types.js";
import { toSongKey } from "../../../graph-pipeline/src/graph/types.js";

function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), "graph-db-test-"));
}

function makeTestGraph(): ListeningGraph {
    const keyA = toSongKey("Artist A", "Track 1");
    const keyB = toSongKey("Artist B", "Track 2");
    const keyC = toSongKey("Artist A", "Track 3");

    const edges: GraphEdge[] = [
        { from: keyA, to: keyB, timestamp: "2024-01-01T00:00:00.000Z" },
        { from: keyA, to: keyB, timestamp: "2024-01-02T00:00:00.000Z" },
        { from: keyA, to: keyB, timestamp: "2024-01-03T00:00:00.000Z" },
        { from: keyB, to: keyC, timestamp: "2024-01-04T00:00:00.000Z" },
    ];

    return {
        nodes: {
            [keyA]: {
                name: "Track 1",
                artists: ["Artist A"],
                albumName: "Album 1",
                next: { [keyB]: 3 } as Record<SongKey, number>,
                previous: {} as Record<SongKey, number>,
                totalPlays: 5,
                playDates: ["2024-01-01T00:00:00.000Z", "2024-01-02T00:00:00.000Z"],
            },
            [keyB]: {
                name: "Track 2",
                artists: ["Artist B"],
                albumName: "Album 2",
                lastfmUrl: "https://last.fm/track/2",
                next: { [keyC]: 1 } as Record<SongKey, number>,
                previous: { [keyA]: 3 } as Record<SongKey, number>,
                totalPlays: 3,
                playDates: ["2024-01-03T00:00:00.000Z"],
            },
            [keyC]: {
                name: "Track 3",
                artists: ["Artist A"],
                next: {} as Record<SongKey, number>,
                previous: { [keyB]: 1 } as Record<SongKey, number>,
                totalPlays: 1,
                playDates: [],
            },
        } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
        edges,
        metadata: {
            totalScrobbles: 9,
            dateRange: {
                from: "2024-01-01T00:00:00Z",
                to: "2024-12-31T00:00:00Z",
            },
            exportTimestamp: "2025-01-15T12:00:00Z",
            lastfmUsername: "testuser",
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
            expect(loadedNode.lastfmUrl).toBe(origNode.lastfmUrl);
            expect(loadedNode.totalPlays).toBe(origNode.totalPlays);
            expect(loadedNode.next).toEqual(origNode.next);
            expect(loadedNode.previous).toEqual(origNode.previous);
            expect(loadedNode.playDates).toEqual(origNode.playDates);
        }

        // Compare edges
        expect(loaded.edges).toHaveLength(original.edges.length);
        for (let i = 0; i < original.edges.length; i++) {
            expect(loaded.edges[i]!.from).toBe(original.edges[i]!.from);
            expect(loaded.edges[i]!.to).toBe(original.edges[i]!.to);
            expect(loaded.edges[i]!.timestamp).toBe(original.edges[i]!.timestamp);
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
        // 4 individual edge events (3 A→B + 1 B→C)
        expect(db.getEdgeCount()).toBe(4);
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
        expect(db.getEdgeCount()).toBe(4);
        expect(second.nodes[keyA]!.totalPlays).toBe(
            first.nodes[keyA]!.totalPlays,
        );
        expect(second.nodes[keyB]!.totalPlays).toBe(
            first.nodes[keyB]!.totalPlays,
        );
        expect(second.nodes[keyA]!.next[keyB]).toBe(
            first.nodes[keyA]!.next[keyB],
        );
    });

    it("handles empty graph", () => {
        const empty: ListeningGraph = {
            nodes: {} as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            edges: [],
            metadata: {
                totalScrobbles: 0,
                dateRange: { from: "", to: "" },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        db.saveGraph(empty);
        const loaded = db.loadGraph();

        expect(Object.keys(loaded.nodes)).toHaveLength(0);
        expect(loaded.edges).toHaveLength(0);
        expect(loaded.metadata.totalScrobbles).toBe(0);
    });
});
