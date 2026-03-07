import path from "node:path";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { GraphDatabase } from "../graph/database.js";
import type { CompactGraphNode } from "../graph/types.js";
import { enrichGraph } from "../analysis/enrich.js";
import { shortestPath, strongestPath } from "../analysis/paths.js";
import { LastfmClient } from "../ingestion/lastfm-client.js";
import { fetchLastfmScrobbles } from "../ingestion/lastfm-fetcher.js";
import { buildGraph } from "../graph/build-graph.js";
import { requireEnv } from "../config.js";
import { computeAllLayouts } from "../analysis/layout.js";

const DATA_DIR = path.join(import.meta.dirname, "../../data");

/** Validate a UUID parameter. Throws an object with `error` and `status` if invalid. */
function parseNodeId(rawId: string): string {
    const decoded = decodeURIComponent(rawId);
    if (!decoded || decoded.length < 1) {
        throw {
            error: "Invalid node ID",
            status: 400,
        };
    }
    return decoded;
}

/** Parse `{ username }` from JSON body, returning 400 if missing. */
async function requireUsername(c: Context): Promise<string> {
    const body = await c.req.json();
    const username = body?.username;
    if (!username || typeof username !== "string") {
        throw { error: "Missing required field: username", status: 400 };
    }
    return username;
}

/** Get required `?user=` query param, returning 400 if missing. */
function requireUserQuery(c: Context): string {
    const user = c.req.query("user");
    if (!user) {
        throw { error: "Missing required query parameter: user", status: 400 };
    }
    return user;
}

export interface ServerConfig {
    dbPath: string;
}


/** Create the Hono app with all graph API routes. */
export function createApp(config: ServerConfig): Hono {
    const app = new Hono();
    const db = new GraphDatabase(config.dbPath);

    // CORS for frontend consumption
    app.use("*", cors());

    // GET /graph — full compact graph (with optional pagination)
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

        const graph = db.loadGraphCompact(userId);
        const allKeys = Object.keys(graph.nodes);

        if (limit > 0) {
            const paginatedKeys = allKeys.slice(offset, offset + limit);
            const paginatedNodes: Record<string, CompactGraphNode> = {};
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

    // GET /graph/node/:id — single node by UUID
    app.get("/graph/node/:id", (c) => {
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

        let nodeId: string;
        try {
            nodeId = parseNodeId(c.req.param("id"));
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const node = db.getNodeById(nodeId, userId);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        return c.json(node);
    });

    // GET /graph/neighbors/:id — immediate neighbors by UUID
    app.get("/graph/neighbors/:id", (c) => {
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

        let nodeId: string;
        try {
            nodeId = parseNodeId(c.req.param("id"));
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const node = db.getNodeById(nodeId, userId);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        // Fetch full node data for each neighbor
        const nextNeighbors: Record<
            string,
            { node: CompactGraphNode & { id: string }; weight: number }
        > = {};
        for (const [id, weight] of Object.entries(node.next)) {
            const neighborNode = db.getNodeById(id, userId);
            if (neighborNode) {
                nextNeighbors[id] = { node: neighborNode, weight };
            }
        }

        const previousNeighbors: Record<
            string,
            { node: CompactGraphNode & { id: string }; weight: number }
        > = {};
        for (const [id, weight] of Object.entries(node.previous)) {
            const neighborNode = db.getNodeById(id, userId);
            if (neighborNode) {
                previousNeighbors[id] = { node: neighborNode, weight };
            }
        }

        return c.json({
            id: nodeId,
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
        const graph = db.loadGraphCompact(userId);

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

    // GET /graph/path — find a path between two songs (accepts UUIDs)
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

        if (algorithm !== "shortest" && algorithm !== "strongest") {
            return c.json(
                { error: "Algorithm must be 'shortest' or 'strongest'" },
                400,
            );
        }

        // Load SongKey-based graph for path algorithms
        const graph = db.loadGraph(userId);

        // Resolve UUIDs to SongKeys if they don't contain "::" (i.e., they're UUIDs)
        let fromKey = from;
        let toKey = to;
        if (!from.includes("::")) {
            const fromNode = db.getNodeById(from, userId);
            if (!fromNode) return c.json({ error: "From node not found" }, 404);
            fromKey = fromNode.songKey;
        }
        if (!to.includes("::")) {
            const toNode = db.getNodeById(to, userId);
            if (!toNode) return c.json({ error: "To node not found" }, 404);
            toKey = toNode.songKey;
        }

        const result =
            algorithm === "strongest"
                ? strongestPath(graph, fromKey as import("../graph/types.js").SongKey, toKey as import("../graph/types.js").SongKey)
                : shortestPath(graph, fromKey as import("../graph/types.js").SongKey, toKey as import("../graph/types.js").SongKey);

        return c.json(result);
    });

    // ===== Pipeline Routes =====

    // POST /pipeline/fetch/lastfm — Fetch scrobble history from Last.fm
    app.post("/pipeline/fetch/lastfm", async (c) => {
        try {
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
        } catch (err) {
            if (err && typeof err === "object" && "status" in err && "error" in err) {
                const e = err as { error: string; status: number };
                return c.json({ error: e.error }, e.status as 400);
            }
            return c.json({ error: `Last.fm fetch failed: ${err instanceof Error ? err.message : err}` }, 500);
        }
    });

    // POST /pipeline/build — Build graph from fetched data, enrich, and store in DB
    app.post("/pipeline/build", async (c) => {
        try {
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

            // Compute layout positions for all three modes
            const allPositions = computeAllLayouts(graph);
            for (const [key, node] of Object.entries(graph.nodes)) {
                const sk = key as import("../graph/types.js").SongKey;
                node.positions = {
                    pagerank: allPositions.pagerank[sk],
                    mds: allPositions.mds[sk],
                    "weighted-mds": allPositions["weighted-mds"][sk],
                };
            }

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
        } catch (err) {
            if (err && typeof err === "object" && "status" in err && "error" in err) {
                const e = err as { error: string; status: number };
                return c.json({ error: e.error }, e.status as 400);
            }
            return c.json({ error: `Build failed: ${err instanceof Error ? err.message : err}` }, 500);
        }
    });

    // POST /pipeline/run — Run the full pipeline: fetch → build → enrich → save
    app.post("/pipeline/run", async (c) => {
        try {
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

            // Compute layout positions for all three modes
            const allPositions = computeAllLayouts(graph);
            for (const [key, node] of Object.entries(graph.nodes)) {
                const sk = key as import("../graph/types.js").SongKey;
                node.positions = {
                    pagerank: allPositions.pagerank[sk],
                    mds: allPositions.mds[sk],
                    "weighted-mds": allPositions["weighted-mds"][sk],
                };
            }
            steps.push("Computed layout positions");

            db.clearGraph(userId);
            db.saveGraph(graph, userId);
            steps.push("Saved to database");

            return c.json({ status: "complete", steps });
        } catch (err) {
            if (err && typeof err === "object" && "status" in err && "error" in err) {
                const e = err as { error: string; status: number };
                return c.json({ error: e.error }, e.status as 400);
            }
            return c.json({ error: `Pipeline failed: ${err instanceof Error ? err.message : err}` }, 500);
        }
    });

    return app;
}
