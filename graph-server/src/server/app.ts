import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { GraphDatabase } from "../graph/database.js";
import type { SongKey, GraphNode } from "../graph/types.js";
import { enrichGraph } from "../analysis/enrich.js";
import { shortestPath, strongestPath } from "../analysis/paths.js";
import { LastfmClient } from "../ingestion/lastfm-client.js";
import { fetchLastfmScrobbles } from "../ingestion/lastfm-fetcher.js";
import { buildGraph } from "../graph/build-graph.js";
import { requireEnv } from "../config.js";

const DATA_DIR = path.join(import.meta.dirname, "../../data");

/** Decode and validate a raw songKey parameter. Throws an object with `error` and `status` if invalid. */
function parseSongKey(rawKey: string): SongKey {
    const decoded = decodeURIComponent(rawKey);
    if (!decoded || !decoded.includes("::")) {
        throw {
            error: "Invalid songKey format. Expected: artist::track",
            status: 400,
        };
    }
    return decoded as SongKey;
}

/** Parse `{ username }` from JSON body, returning 400 if missing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireUsername(c: any): Promise<string> {
    const body = await c.req.json();
    const username = body?.username;
    if (!username || typeof username !== "string") {
        throw { error: "Missing required field: username", status: 400 };
    }
    return username;
}

/** Get required `?user=` query param, returning 400 if missing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireUserQuery(c: any): string {
    const user = c.req.query("user");
    if (!user) {
        throw { error: "Missing required query parameter: user", status: 400 };
    }
    return user;
}

export interface ServerConfig {
    dbPath: string;
}

/** Run an async handler, catching errors and returning a 500 JSON response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pipelineHandler(c: any, label: string, fn: () => Promise<any>) {
    try {
        return await fn();
    } catch (err) {
        // Re-throw structured errors with status codes
        if (err && typeof err === "object" && "status" in err && "error" in err) {
            const e = err as { error: string; status: number };
            return c.json({ error: e.error }, e.status);
        }
        return c.json(
            {
                error: `${label}: ${err instanceof Error ? err.message : err}`,
            },
            500,
        );
    }
}

/** Create the Hono app with all graph API routes. */
export function createApp(config: ServerConfig): Hono {
    const app = new Hono();
    const db = new GraphDatabase(config.dbPath);

    // CORS for frontend consumption
    app.use("*", cors());

    // GET /graph — full graph (with optional pagination)
    app.get("/graph", (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        const limit = parseInt(c.req.query("limit") ?? "0", 10);
        const offset = parseInt(c.req.query("offset") ?? "0", 10);

        const graph = db.loadGraph(userId);
        const allKeys = Object.keys(graph.nodes) as SongKey[];

        if (limit > 0) {
            const paginatedKeys = allKeys.slice(offset, offset + limit);
            const paginatedNodes: Record<string, GraphNode> = {};
            for (const key of paginatedKeys) {
                paginatedNodes[key] = graph.nodes[key]!;
            }
            return c.json({
                nodes: paginatedNodes,
                metadata: graph.metadata,
                pagination: {
                    total: allKeys.length,
                    offset,
                    limit,
                    hasMore: offset + limit < allKeys.length,
                },
            });
        }

        return c.json(graph);
    });

    // GET /graph/node/:songKey — single node with its edges
    app.get("/graph/node/:songKey", (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        let songKey: SongKey;
        try {
            songKey = parseSongKey(c.req.param("songKey"));
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const node = db.getNode(songKey, userId);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        return c.json({ songKey, ...node });
    });

    // GET /graph/neighbors/:songKey — immediate neighbors (next + previous)
    app.get("/graph/neighbors/:songKey", (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        let songKey: SongKey;
        try {
            songKey = parseSongKey(c.req.param("songKey"));
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const node = db.getNode(songKey, userId);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        // Fetch full node data for each neighbor
        const nextNeighbors: Record<
            string,
            { node: GraphNode; weight: number }
        > = {};
        for (const [key, weight] of Object.entries(node.next)) {
            const neighborNode = db.getNode(key as SongKey, userId);
            if (neighborNode) {
                nextNeighbors[key] = { node: neighborNode, weight };
            }
        }

        const previousNeighbors: Record<
            string,
            { node: GraphNode; weight: number }
        > = {};
        for (const [key, weight] of Object.entries(node.previous)) {
            const neighborNode = db.getNode(key as SongKey, userId);
            if (neighborNode) {
                previousNeighbors[key] = { node: neighborNode, weight };
            }
        }

        return c.json({
            songKey,
            node,
            next: nextNeighbors,
            previous: previousNeighbors,
        });
    });

    // GET /graph/stats — summary statistics
    app.get("/graph/stats", (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        const nodeCount = db.getNodeCount(userId);
        const edgeCount = db.getEdgeCount(userId);
        const graph = db.loadGraph(userId);

        return c.json({
            totalNodes: nodeCount,
            totalEdges: edgeCount,
            metadata: graph.metadata,
        });
    });

    // GET /graph/analysis — full analysis: stats, rankings, PageRank top songs, cluster summaries
    app.get("/graph/analysis", (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        const topN = parseInt(c.req.query("topN") ?? "20", 10);
        const graph = db.loadGraph(userId);
        const { summary } = enrichGraph(graph, { topN });
        return c.json(summary);
    });

    // GET /graph/path — find a path between two songs
    app.get("/graph/path", (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        const from = c.req.query("from");
        const to = c.req.query("to");
        const algorithm = c.req.query("algorithm") ?? "shortest";

        if (!from || !to) {
            return c.json(
                { error: "Both 'from' and 'to' query parameters are required" },
                400,
            );
        }

        let fromKey: SongKey;
        let toKey: SongKey;
        try {
            fromKey = parseSongKey(from);
            toKey = parseSongKey(to);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        if (algorithm !== "shortest" && algorithm !== "strongest") {
            return c.json(
                { error: "Algorithm must be 'shortest' or 'strongest'" },
                400,
            );
        }

        const graph = db.loadGraph(userId);
        const result =
            algorithm === "strongest"
                ? strongestPath(graph, fromKey, toKey)
                : shortestPath(graph, fromKey, toKey);

        return c.json(result);
    });

    // ===== Pipeline Routes =====

    // POST /pipeline/fetch/lastfm — Fetch scrobble history from Last.fm
    app.post("/pipeline/fetch/lastfm", (c) =>
        pipelineHandler(c, "Last.fm fetch failed", async () => {
            const username = await requireUsername(c);
            const apiKey = requireEnv("LASTFM_API_KEY");
            const client = new LastfmClient({ apiKey, username });
            await client.verifyAuth();

            db.getOrCreateUser(username);

            const logs: string[] = [];
            const scrobbles = await fetchLastfmScrobbles(client, {
                username,
                onProgress: (msg) => logs.push(msg),
            });

            return c.json({
                status: "complete",
                scrobbleCount: scrobbles.length,
                logs,
            });
        }),
    );

    // POST /pipeline/build — Build graph from fetched data, enrich, and store in DB
    app.post("/pipeline/build", (c) =>
        pipelineHandler(c, "Build failed", async () => {
            const username = await requireUsername(c);
            const userId = db.getUserId(username);
            if (userId === null) {
                return c.json(
                    { error: "User not found. Fetch data first via /pipeline/fetch/lastfm" },
                    404,
                );
            }

            const { readFile } = await import("node:fs/promises");
            const { existsSync } = await import("node:fs");

            const lastfmPath = path.join(DATA_DIR, `lastfm-scrobbles-${username}.json`);

            if (!existsSync(lastfmPath)) {
                return c.json(
                    {
                        error: "No data found. Fetch data first via /pipeline/fetch/lastfm",
                    },
                    400,
                );
            }

            const lastfmScrobbles = JSON.parse(
                await readFile(lastfmPath, "utf-8"),
            );

            const graph = buildGraph({
                lastfmScrobbles,
                lastfmUsername: username,
            });

            const { summary } = enrichGraph(graph);
            db.clearGraph(userId);
            db.saveGraph(graph, userId);

            const nodeCount = Object.keys(graph.nodes).length;
            const edgeCount = Object.values(graph.nodes).reduce(
                (sum, n) => sum + Object.keys(n.next).length,
                0,
            );

            return c.json({
                status: "complete",
                nodes: nodeCount,
                edges: edgeCount,
                clusters: summary.clusters.clusterCount,
                pageRankConverged: summary.pageRank.converged,
            });
        }),
    );

    // POST /pipeline/run — Run the full pipeline: fetch → build → enrich → save
    app.post("/pipeline/run", (c) =>
        pipelineHandler(c, "Pipeline failed", async () => {
            const username = await requireUsername(c);
            const steps: string[] = [];

            const apiKey = requireEnv("LASTFM_API_KEY");
            const client = new LastfmClient({ apiKey, username });
            await client.verifyAuth();
            steps.push("Last.fm auth verified");

            const userId = db.getOrCreateUser(username);

            const scrobbles = await fetchLastfmScrobbles(client, { username });
            steps.push(`Fetched ${scrobbles.length} scrobbles from Last.fm`);

            const graph = buildGraph({
                lastfmScrobbles: scrobbles,
                lastfmUsername: username,
            });
            steps.push(`Built graph: ${Object.keys(graph.nodes).length} nodes`);

            const { summary } = enrichGraph(graph);
            steps.push(
                `Enriched: ${summary.clusters.clusterCount} clusters, PageRank converged=${summary.pageRank.converged}`,
            );

            db.clearGraph(userId);
            db.saveGraph(graph, userId);
            steps.push("Saved to database");

            return c.json({ status: "complete", steps });
        }),
    );

    return app;
}
