import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GraphDatabase } from "../../../graph-server/src/graph/database.js";
import type { ListeningGraph, SongKey } from "../../../graph-server/src/graph/types.js";
import { toSongKey } from "../../../graph-server/src/graph/types.js";
import {
    TEST_DATABASE_URL,
    resetTestDatabase,
} from "../postgres-test-utils.js";

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
                mbid: "mbid-aaa",
                next: { [keyB]: 3 } as Record<SongKey, number>,
                previous: {} as Record<SongKey, number>,
                totalPlays: 5,
                sources: ["lastfm"],
                playDates: [],
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
                playDates: [],
            },
            [keyC]: {
                name: "Track 3",
                artists: ["Artist A"],
                next: {} as Record<SongKey, number>,
                previous: { [keyB]: 1 } as Record<SongKey, number>,
                totalPlays: 1,
                sources: ["lastfm"],
                playDates: [],
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
        },
    };
}

describe("GraphDatabase", () => {
    let db: GraphDatabase;
    let userId: number;

    beforeEach(async () => {
        db = new GraphDatabase(TEST_DATABASE_URL);
        await db.getUserId("__schema_init__");
        await resetTestDatabase();
        userId = await db.getOrCreateUser("testuser");
    });

    afterEach(async () => {
        await db.close();
    });

    it("getOrCreateUser returns same id for same username", async () => {
        const id1 = await db.getOrCreateUser("alice");
        const id2 = await db.getOrCreateUser("alice");
        expect(id1).toBe(id2);
    });

    it("getOrCreateUser returns different ids for different usernames", async () => {
        const id1 = await db.getOrCreateUser("alice");
        const id2 = await db.getOrCreateUser("bob");
        expect(id1).not.toBe(id2);
    });

    it("getUserId returns null for unknown username", async () => {
        expect(await db.getUserId("unknown")).toBeNull();
    });

    it("getUserId returns id for known username", async () => {
        const id = await db.getOrCreateUser("alice");
        expect(await db.getUserId("alice")).toBe(id);
    });

    it("enqueuePipelineJob stores a queued job with timestamps", async () => {
        const jobId = await db.enqueuePipelineJob("alice");
        const job = await db.getPipelineJob(jobId);

        expect(job).not.toBeNull();
        expect(job!.id).toBe(jobId);
        expect(job!.status).toBe("queued");
        expect(job!.createdAt).toBeTruthy();
        expect(job!.updatedAt).toBeTruthy();
        expect(job!.startedAt).toBeNull();
        expect(job!.finishedAt).toBeNull();
    });

    it("claimNextQueuedPipelineJob moves queued job to running", async () => {
        const jobId = await db.enqueuePipelineJob("alice");
        const claimed = await db.claimNextQueuedPipelineJob();

        expect(claimed).not.toBeNull();
        expect(claimed!.id).toBe(jobId);
        expect(claimed!.username).toBe("alice");

        const job = await db.getPipelineJob(jobId);
        expect(job).not.toBeNull();
        expect(job!.status).toBe("running");
        expect(job!.startedAt).toBeTruthy();
        expect(job!.finishedAt).toBeNull();
    });

    it("marks claimed jobs as succeeded or failed", async () => {
        const successId = await db.enqueuePipelineJob("alice");
        const failedId = await db.enqueuePipelineJob("alice");

        const claim1 = await db.claimNextQueuedPipelineJob();
        const claim2 = await db.claimNextQueuedPipelineJob();
        expect(claim1).not.toBeNull();
        expect(claim2).not.toBeNull();

        await db.markPipelineJobSucceeded(successId);
        await db.markPipelineJobFailed(failedId);

        const succeeded = await db.getPipelineJob(successId);
        const failed = await db.getPipelineJob(failedId);

        expect(succeeded).not.toBeNull();
        expect(succeeded!.status).toBe("succeeded");
        expect(succeeded!.finishedAt).toBeTruthy();

        expect(failed).not.toBeNull();
        expect(failed!.status).toBe("failed");
        expect(failed!.finishedAt).toBeTruthy();
    });

    it("listPipelineJobs filters by username", async () => {
        const alice1 = await db.enqueuePipelineJob("alice");
        const alice2 = await db.enqueuePipelineJob("alice");
        await db.enqueuePipelineJob("bob");

        const aliceJobs = await db.listPipelineJobs("alice");
        expect(aliceJobs).toHaveLength(2);
        const ids = new Set(aliceJobs.map((job) => job.id));
        expect(ids.has(alice1)).toBe(true);
        expect(ids.has(alice2)).toBe(true);
    });

    it("round-trips a graph: save → loadGraph → matches original (SongKey-based)", async () => {
        const original = makeTestGraph();
        await db.saveGraph(original, userId);
        const loaded = await db.loadGraph(userId);

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
            expect(loadedNode.mbid).toBe(origNode.mbid);
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
    });

    it("loadGraphCompact returns UUID-keyed nodes with compact edges", async () => {
        const original = makeTestGraph();
        await db.saveGraph(original, userId);
        const compact = await db.loadGraphCompact(userId);

        // UUID keys should not contain "::"
        const uuids = Object.keys(compact.nodes);
        expect(uuids).toHaveLength(3);
        for (const uuid of uuids) {
            expect(uuid).not.toContain("::");
        }

        // Each compact node should have songKey
        for (const node of Object.values(compact.nodes)) {
            expect(node.songKey).toContain("::");
        }

        // Find the node for Track 1 (has mbid)
        const track1 = Object.values(compact.nodes).find(n => n.name === "Track 1");
        expect(track1).toBeDefined();
        expect(track1!.mbid).toBe("mbid-aaa");

        // Verify edges use UUID keys
        const track1Entry = Object.entries(compact.nodes).find(([, n]) => n.name === "Track 1");
        expect(track1Entry).toBeDefined();
        const [track1Uuid, track1Node] = track1Entry!;
        const nextUuids = Object.keys(track1Node.next);
        expect(nextUuids).toHaveLength(1);
        // The next UUID should be a valid key in the nodes map
        expect(compact.nodes[nextUuids[0]!]).toBeDefined();
        expect(compact.nodes[nextUuids[0]!]!.name).toBe("Track 2");

        // Verify previous edges on Track 2
        const track2 = Object.values(compact.nodes).find(n => n.name === "Track 2");
        expect(track2).toBeDefined();
        const prevUuids = Object.keys(track2!.previous);
        expect(prevUuids).toHaveLength(1);
        expect(prevUuids[0]).toBe(track1Uuid);

        // Metadata should match
        expect(compact.metadata.totalScrobbles).toBe(original.metadata.totalScrobbles);
    });

    it("getNodeById returns compact node by UUID", async () => {
        await db.saveGraph(makeTestGraph(), userId);
        const compact = await db.loadGraphCompact(userId);

        const [uuid, expectedNode] = Object.entries(compact.nodes).find(
            ([, n]) => n.name === "Track 1",
        )!;

        const fetched = await db.getNodeById(uuid, userId);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(uuid);
        expect(fetched!.name).toBe("Track 1");
        expect(fetched!.songKey).toBe(expectedNode.songKey);
        expect(fetched!.mbid).toBe("mbid-aaa");
        // Edges should use UUIDs
        const nextUuids = Object.keys(fetched!.next);
        expect(nextUuids).toHaveLength(1);
        expect(nextUuids[0]).not.toContain("::");
    });

    it("getNodeById returns null for unknown UUID", async () => {
        const result = await db.getNodeById("nonexistent-uuid", userId);
        expect(result).toBeNull();
    });

    it("supports incremental updates — merges edge weights and play counts", async () => {
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
                    playDates: [],
                },
                [keyB]: {
                    name: "Track 2",
                    artists: ["Artist B"],
                    next: {} as Record<SongKey, number>,
                    previous: { [keyA]: 2 } as Record<SongKey, number>,
                    totalPlays: 2,
                    sources: ["lastfm"],
                    playDates: [],
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

        await db.saveGraph(graph1, userId);

        // Second insert — adds more plays
        const graph2: ListeningGraph = {
            nodes: {
                [keyA]: {
                    name: "Track 1",
                    artists: ["Artist A"],
                    next: { [keyB]: 1 } as Record<SongKey, number>,
                    previous: {} as Record<SongKey, number>,
                    totalPlays: 2,
                    sources: ["lastfm"],
                    playDates: [],
                },
                [keyB]: {
                    name: "Track 2",
                    artists: ["Artist B"],
                    next: {} as Record<SongKey, number>,
                    previous: { [keyA]: 1 } as Record<SongKey, number>,
                    totalPlays: 1,
                    sources: ["lastfm"],
                    playDates: [],
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

        await db.saveGraph(graph2, userId);

        const loaded = await db.loadGraph(userId);

        // Play counts should be summed
        expect(loaded.nodes[keyA]!.totalPlays).toBe(5); // 3 + 2
        expect(loaded.nodes[keyB]!.totalPlays).toBe(3); // 2 + 1

        // Edge weights should be summed
        expect(loaded.nodes[keyA]!.next[keyB]).toBe(3); // 2 + 1

        // Metadata should reflect latest export
        expect(loaded.metadata.exportTimestamp).toBe("2025-02-01T00:00:00Z");
    });

    it("supports incremental updates — merges source_plays per-source counts", async () => {
        const keyA = toSongKey("Artist A", "Track 1");

        // First save with lastfm plays
        const graph1: ListeningGraph = {
            nodes: {
                [keyA]: {
                    name: "Track 1",
                    artists: ["Artist A"],
                    next: {} as Record<SongKey, number>,
                    previous: {} as Record<SongKey, number>,
                    totalPlays: 3,
                    sources: ["lastfm"],
                    sourcePlays: { lastfm: 3 },
                    playDates: [],
                },
            } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 3,
                dateRange: {
                    from: "2024-01-01T00:00:00Z",
                    to: "2024-06-01T00:00:00Z",
                },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        await db.saveGraph(graph1, userId);

        // Second save with more lastfm plays
        const graph2: ListeningGraph = {
            nodes: {
                [keyA]: {
                    name: "Track 1",
                    artists: ["Artist A"],
                    next: {} as Record<SongKey, number>,
                    previous: {} as Record<SongKey, number>,
                    totalPlays: 2,
                    sources: ["lastfm"],
                    sourcePlays: { lastfm: 2 },
                    playDates: [],
                },
            } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 2,
                dateRange: {
                    from: "2024-06-01T00:00:00Z",
                    to: "2024-12-01T00:00:00Z",
                },
                exportTimestamp: "2025-02-01T00:00:00Z",
            },
        };

        await db.saveGraph(graph2, userId);

        const loaded = await db.loadGraph(userId);

        // source_plays should be merged additively
        expect(loaded.nodes[keyA]!.sourcePlays).toEqual({
            lastfm: 5,
        });
    });

    it("isolates data between users", async () => {
        const aliceId = await db.getOrCreateUser("alice");
        const bobId = await db.getOrCreateUser("bob");

        const keyA = toSongKey("Artist A", "Track 1");

        const aliceGraph: ListeningGraph = {
            nodes: {
                [keyA]: {
                    name: "Track 1",
                    artists: ["Artist A"],
                    next: {} as Record<SongKey, number>,
                    previous: {} as Record<SongKey, number>,
                    totalPlays: 5,
                    sources: ["lastfm"],
                    playDates: [],
                },
            } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 5,
                dateRange: { from: "", to: "" },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        await db.saveGraph(aliceGraph, aliceId);

        // Bob should have no data
        expect(await db.getNodeCount(bobId)).toBe(0);
        expect(await db.getNodeCount(aliceId)).toBe(1);
    });

    it("getNode returns a single node with edges (SongKey-based)", async () => {
        const graph = makeTestGraph();
        await db.saveGraph(graph, userId);

        const keyA = toSongKey("Artist A", "Track 1");
        const keyB = toSongKey("Artist B", "Track 2");

        const node = await db.getNode(keyA, userId);
        expect(node).not.toBeNull();
        expect(node!.name).toBe("Track 1");
        expect(node!.next[keyB]).toBe(3);
    });

    it("getNode returns null for nonexistent key", async () => {
        const node = await db.getNode("nonexistent::key" as SongKey, userId);
        expect(node).toBeNull();
    });

    it("getNodeCount and getEdgeCount", async () => {
        const graph = makeTestGraph();
        await db.saveGraph(graph, userId);

        expect(await db.getNodeCount(userId)).toBe(3);
        expect(await db.getEdgeCount(userId)).toBe(2); // A→B, B→C
    });

    it("clearGraph + saveGraph is idempotent — repeated saves produce identical data", async () => {
        const graph = makeTestGraph();
        const keyA = toSongKey("Artist A", "Track 1");
        const keyB = toSongKey("Artist B", "Track 2");

        // Save once
        await db.clearGraph(userId);
        await db.saveGraph(graph, userId);
        const first = await db.loadGraph(userId);

        // Save again with clear — should be identical
        await db.clearGraph(userId);
        await db.saveGraph(graph, userId);
        const second = await db.loadGraph(userId);

        expect(await db.getNodeCount(userId)).toBe(Object.keys(graph.nodes).length);
        expect(await db.getEdgeCount(userId)).toBe(2);
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

    it("handles empty graph", async () => {
        const empty: ListeningGraph = {
            nodes: {} as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 0,
                dateRange: { from: "", to: "" },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        await db.saveGraph(empty, userId);
        const loaded = await db.loadGraph(userId);

        expect(Object.keys(loaded.nodes)).toHaveLength(0);
        expect(loaded.metadata.totalScrobbles).toBe(0);
    });

    it("preserves UUIDs across incremental saves", async () => {
        const keyA = toSongKey("Artist A", "Track 1");

        const graph1: ListeningGraph = {
            nodes: {
                [keyA]: {
                    name: "Track 1",
                    artists: ["Artist A"],
                    next: {} as Record<SongKey, number>,
                    previous: {} as Record<SongKey, number>,
                    totalPlays: 1,
                    sources: ["lastfm"],
                    playDates: [],
                },
            } as Record<SongKey, ListeningGraph["nodes"][SongKey]>,
            metadata: {
                totalScrobbles: 1,
                dateRange: { from: "", to: "" },
                exportTimestamp: "2025-01-01T00:00:00Z",
            },
        };

        await db.saveGraph(graph1, userId);
        const compact1 = await db.loadGraphCompact(userId);
        const uuid1 = Object.keys(compact1.nodes)[0]!;

        // Second save — same node should keep same UUID
        await db.saveGraph(graph1, userId);
        const compact2 = await db.loadGraphCompact(userId);
        const uuid2 = Object.keys(compact2.nodes)[0]!;

        expect(uuid2).toBe(uuid1);
    });
});
