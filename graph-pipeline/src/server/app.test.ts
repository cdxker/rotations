import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "./app.js";
import { GraphDatabase } from "../graph/database.js";
import { buildGraph } from "../graph/build-graph.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { unlinkSync } from "node:fs";
import type { Hono } from "hono";

function seedDatabase(dbPath: string): GraphDatabase {
    const db = new GraphDatabase(dbPath);
    const graph = buildGraph({
        lastfmScrobbles: [
            {
                artist: "Radiohead",
                track: "Creep",
                album: "Pablo Honey",
                timestamp: 1000,
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
    db.saveGraph(graph);
    return db;
}

describe("Graph API Server", () => {
    let app: Hono;
    let tmpDir: string;
    let dbPath: string;
    let db: GraphDatabase;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "graph-server-test-"));
        dbPath = join(tmpDir, "test.db");
        db = seedDatabase(dbPath);
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
        it("returns the full graph", async () => {
            const res = await app.request("/graph");
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.nodes).toBeDefined();
            expect(data.metadata).toBeDefined();
            expect(data.metadata.lastfmUsername).toBe("testuser");

            // Should have 3 nodes: Creep, Karma Police, Smells Like Teen Spirit
            const nodeKeys = Object.keys(data.nodes);
            expect(nodeKeys).toHaveLength(3);
        });

        it("supports pagination with limit and offset", async () => {
            const res = await app.request("/graph?limit=2&offset=0");
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
            const res = await app.request("/graph?limit=2&offset=2");
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(Object.keys(data.nodes)).toHaveLength(1);
            expect(data.pagination.hasMore).toBe(false);
        });
    });

    describe("GET /graph/node/:songKey", () => {
        it("returns a single node", async () => {
            const key = encodeURIComponent("radiohead::creep");
            const res = await app.request(`/graph/node/${key}`);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.songKey).toBe("radiohead::creep");
            expect(data.name).toBe("Creep");
            expect(data.totalPlays).toBe(2);
            expect(data.next).toBeDefined();
            expect(data.previous).toBeDefined();
        });

        it("returns 404 for unknown songKey", async () => {
            const key = encodeURIComponent("unknown::song");
            const res = await app.request(`/graph/node/${key}`);
            expect(res.status).toBe(404);
        });

        it("returns 400 for invalid songKey format", async () => {
            const res = await app.request("/graph/node/invalidsongkey");
            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toContain("Invalid songKey");
        });
    });

    describe("GET /graph/neighbors/:songKey", () => {
        it("returns neighbors with full node data", async () => {
            const key = encodeURIComponent("radiohead::karma police");
            const res = await app.request(`/graph/neighbors/${key}`);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.songKey).toBe("radiohead::karma police");
            expect(data.node).toBeDefined();
            expect(data.next).toBeDefined();
            expect(data.previous).toBeDefined();

            // Karma Police is preceded by Creep and followed by Creep
            const prevKeys = Object.keys(data.previous);
            expect(prevKeys).toContain("radiohead::creep");
        });

        it("returns 404 for unknown songKey", async () => {
            const key = encodeURIComponent("unknown::song");
            const res = await app.request(`/graph/neighbors/${key}`);
            expect(res.status).toBe(404);
        });

        it("returns 400 for invalid songKey format", async () => {
            const res = await app.request("/graph/neighbors/bad");
            expect(res.status).toBe(400);
        });
    });

    describe("GET /graph/stats", () => {
        it("returns summary statistics", async () => {
            const res = await app.request("/graph/stats");
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.totalNodes).toBe(3);
            expect(data.totalEdges).toBeGreaterThan(0);
            expect(data.metadata).toBeDefined();
            expect(data.metadata.totalScrobbles).toBe(4);
        });
    });

    describe("CORS", () => {
        it("includes CORS headers", async () => {
            const res = await app.request("/graph/stats", {
                headers: { Origin: "http://localhost:3000" },
            });
            expect(res.headers.get("access-control-allow-origin")).toBe("*");
        });
    });
});
