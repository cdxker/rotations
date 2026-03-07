import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../../../graph-server/src/server/app.js";
import { GraphDatabase } from "../../../graph-server/src/graph/database.js";
import { buildGraph } from "../../../graph-server/src/graph/build-graph.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { unlinkSync } from "node:fs";
import type { Hono } from "hono";
import type { CompactGraphNode } from "../../../graph-server/src/graph/types.js";

function seedDatabase(dbPath: string): { db: GraphDatabase; userId: number } {
    const db = new GraphDatabase(dbPath);
    const userId = db.getOrCreateUser("testuser");
    const graph = buildGraph({
        lastfmScrobbles: [
            {
                artist: "Radiohead",
                track: "Creep",
                album: "Pablo Honey",
                timestamp: 1000,
                mbid: "creep-mbid-123",
            },
            {
                artist: "Radiohead",
                track: "Karma Police",
                album: "OK Computer",
                timestamp: 2000,
            },
            {
                artist: "Radiohead",
                track: "Creep",
                album: "Pablo Honey",
                timestamp: 3000,
            },
            {
                artist: "Nirvana",
                track: "Smells Like Teen Spirit",
                album: "Nevermind",
                timestamp: 4000,
            },
        ],
        lastfmUsername: "testuser",
    });
    db.saveGraph(graph, userId);
    return { db, userId };
}

/** Helper to find a UUID by song name in compact graph response. */
function findUuidByName(
    nodes: Record<string, CompactGraphNode>,
    name: string,
): string | undefined {
    return Object.entries(nodes).find(([, n]) => n.name === name)?.[0];
}

describe("Graph API Server", () => {
    let app: Hono;
    let tmpDir: string;
    let dbPath: string;
    let db: GraphDatabase;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "graph-server-test-"));
        dbPath = join(tmpDir, "test.db");
        const seed = seedDatabase(dbPath);
        db = seed.db;
        app = createApp({ dbPath });
    });

    afterEach(() => {
        db.close();
        try {
            unlinkSync(dbPath);
        } catch {
            // ignore
        }
    });

    describe("GET /graph", () => {
        it("returns 400 without user param", async () => {
            const res = await app.request("/graph");
            expect(res.status).toBe(400);
        });

        it("returns 404 for unknown user", async () => {
            const res = await app.request("/graph?user=nobody");
            expect(res.status).toBe(404);
        });

        it("returns compact graph with UUID-keyed nodes", async () => {
            const res = await app.request("/graph?user=testuser");
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.nodes).toBeDefined();
            expect(data.metadata).toBeDefined();
            expect(data.metadata.lastfmUsername).toBe("testuser");

            // Should have 3 nodes
            const nodeKeys = Object.keys(data.nodes);
            expect(nodeKeys).toHaveLength(3);

            // Keys should be UUIDs (not SongKeys)
            for (const key of nodeKeys) {
                expect(key).not.toContain("::");
            }

            // Each node should have songKey
            for (const node of Object.values(data.nodes) as CompactGraphNode[]) {
                expect(node.songKey).toContain("::");
                expect(node.name).toBeTruthy();
            }

            // Verify mbid present on Creep
            const creepNode = Object.values(data.nodes as Record<string, CompactGraphNode>).find(
                (n) => n.name === "Creep",
            );
            expect(creepNode).toBeDefined();
            expect(creepNode!.mbid).toBe("creep-mbid-123");

            // Verify next/previous use UUID keys
            const creepUuid = findUuidByName(data.nodes, "Creep")!;
            const karmaUuid = findUuidByName(data.nodes, "Karma Police")!;
            expect(data.nodes[creepUuid].next[karmaUuid]).toBeDefined();
        });

        it("supports pagination with limit and offset", async () => {
            const res = await app.request("/graph?user=testuser&limit=2&offset=0");
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(Object.keys(data.nodes)).toHaveLength(2);
            expect(data.pagination).toBeDefined();
            expect(data.pagination.total).toBe(3);
            expect(data.pagination.limit).toBe(2);
            expect(data.pagination.offset).toBe(0);
            expect(data.pagination.hasMore).toBe(true);
        });

        it("pagination second page", async () => {
            const res = await app.request("/graph?user=testuser&limit=2&offset=2");
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(Object.keys(data.nodes)).toHaveLength(1);
            expect(data.pagination.hasMore).toBe(false);
        });
    });

    describe("GET /graph/node/:id", () => {
        it("returns a single node by UUID", async () => {
            // First get the graph to find a UUID
            const graphRes = await app.request("/graph?user=testuser");
            const graphData = await graphRes.json();
            const creepUuid = findUuidByName(graphData.nodes, "Creep")!;

            const res = await app.request(`/graph/node/${creepUuid}?user=testuser`);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.id).toBe(creepUuid);
            expect(data.songKey).toBe("radiohead::creep");
            expect(data.name).toBe("Creep");
            expect(data.totalPlays).toBe(2);
            expect(data.mbid).toBe("creep-mbid-123");
            expect(data.next).toBeDefined();
            expect(data.previous).toBeDefined();
        });

        it("returns 404 for unknown UUID", async () => {
            const res = await app.request("/graph/node/nonexistent-uuid?user=testuser");
            expect(res.status).toBe(404);
        });

        it("returns 400 without user param", async () => {
            const res = await app.request("/graph/node/some-uuid");
            expect(res.status).toBe(400);
        });
    });

    describe("GET /graph/neighbors/:id", () => {
        it("returns neighbors with UUID keys", async () => {
            // First get the graph to find UUIDs
            const graphRes = await app.request("/graph?user=testuser");
            const graphData = await graphRes.json();
            const karmaUuid = findUuidByName(graphData.nodes, "Karma Police")!;
            const creepUuid = findUuidByName(graphData.nodes, "Creep")!;

            const res = await app.request(`/graph/neighbors/${karmaUuid}?user=testuser`);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.id).toBe(karmaUuid);
            expect(data.node).toBeDefined();
            expect(data.next).toBeDefined();
            expect(data.previous).toBeDefined();

            // Karma Police is preceded by Creep
            expect(data.previous[creepUuid]).toBeDefined();
            expect(data.previous[creepUuid].node.name).toBe("Creep");
        });

        it("returns 404 for unknown UUID", async () => {
            const res = await app.request("/graph/neighbors/nonexistent-uuid?user=testuser");
            expect(res.status).toBe(404);
        });
    });

    describe("GET /graph/stats", () => {
        it("returns summary statistics", async () => {
            const res = await app.request("/graph/stats?user=testuser");
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.totalNodes).toBe(3);
            expect(data.totalEdges).toBeGreaterThan(0);
            expect(data.metadata).toBeDefined();
            expect(data.metadata.totalScrobbles).toBe(4);
        });

        it("returns 400 without user param", async () => {
            const res = await app.request("/graph/stats");
            expect(res.status).toBe(400);
        });
    });

    describe("CORS", () => {
        it("includes CORS headers", async () => {
            const res = await app.request("/graph/stats?user=testuser", {
                headers: { Origin: "http://localhost:3000" },
            });
            expect(res.headers.get("access-control-allow-origin")).toBe("*");
        });
    });
});
