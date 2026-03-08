import path from "node:path";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { GraphDatabase } from "../graph/database.js";
import type {
    CompactGraphNode,
    ListeningGraph,
    SongKey,
} from "../graph/types.js";
import { enrichGraph } from "../analysis/enrich.js";
import { shortestPath, strongestPath } from "../analysis/paths.js";
import { LastfmClient } from "../ingestion/lastfm-client.js";
import { fetchLastfmScrobbles } from "../ingestion/lastfm-fetcher.js";
import { buildGraph, type RawScrobble } from "../graph/build-graph.js";
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

/** Compute and attach all supported layout modes onto graph nodes. */
function attachLayoutPositions(graph: ListeningGraph): void {
    const allPositions = computeAllLayouts(graph);
    for (const [key, node] of Object.entries(graph.nodes)) {
        const songKey = key as SongKey;
        node.positions = {
            pagerank: allPositions.pagerank[songKey],
            mds: allPositions.mds[songKey],
            "weighted-mds": allPositions["weighted-mds"][songKey],
        };
    }
}

/** Build + enrich + layout + persist a user's graph from fetched scrobbles. */
async function buildAndSaveUserGraph(
    db: GraphDatabase,
    username: string,
    lastfmScrobbles: RawScrobble[],
): Promise<{
    nodeCount: number;
    edgeCount: number;
    clusterCount: number;
    pageRankConverged: boolean;
}> {
    const userId = await db.getOrCreateUser(username);
    const graph = buildGraph({
        lastfmScrobbles,
        lastfmUsername: username,
    });
    const { summary } = enrichGraph(graph);
    attachLayoutPositions(graph);

    await db.clearGraph(userId);
    await db.saveGraph(graph, userId);

    const nodeCount = Object.keys(graph.nodes).length;
    const edgeCount = Object.values(graph.nodes).reduce(
        (sum, node) => sum + Object.keys(node.next).length,
        0,
    );

    return {
        nodeCount,
        edgeCount,
        clusterCount: summary.clusters.clusterCount,
        pageRankConverged: summary.pageRank.converged,
    };
}

/** Full fetch→build pipeline for one user. */
async function runPipelineForUser(
    db: GraphDatabase,
    username: string,
): Promise<void> {
    const apiKey = requireEnv("LASTFM_API_KEY");
    const client = new LastfmClient({ apiKey, username });
    await client.verifyAuth();
    const scrobbles = await fetchLastfmScrobbles(client, { username });
    await buildAndSaveUserGraph(db, username, scrobbles);
}

export interface ServerConfig {
    databaseUrl?: string;
    db?: GraphDatabase;
    enablePipelineWorker?: boolean;
    pipelineWorkerPollIntervalMs?: number;
}

/** Create the Hono app with all graph API routes. */
export function createApp(config: ServerConfig): Hono {
    const app = new Hono();
    const db =
        config.db ??
        (config.databaseUrl
            ? new GraphDatabase(config.databaseUrl)
            : (() => {
                  throw new Error(
                      "createApp requires either config.db or config.databaseUrl",
                  );
              })());
    const enablePipelineWorker = config.enablePipelineWorker ?? true;
    const pipelineWorkerPollIntervalMs =
        config.pipelineWorkerPollIntervalMs ?? 2_000;
    let workerBusy = false;

    const pollPipelineQueue = async (): Promise<void> => {
        if (workerBusy) return;
        workerBusy = true;

        try {
            const job = await db.claimNextQueuedPipelineJob();
            if (!job) return;

            try {
                await runPipelineForUser(db, job.username);
                await db.markPipelineJobSucceeded(job.id);
            } catch (err) {
                await db.markPipelineJobFailed(job.id);
                console.error(
                    `[pipeline-worker] job ${job.id} failed for ${job.username}:`,
                    err,
                );
            }
        } finally {
            workerBusy = false;
        }
    };

    if (enablePipelineWorker) {
        const timer = setInterval(() => {
            void pollPipelineQueue();
        }, pipelineWorkerPollIntervalMs);
        timer.unref();
    }

    // CORS for frontend consumption
    app.use("*", logger());
    app.use("*", cors());

    // GET /graph — full compact graph (with optional pagination)
    app.get("/graph", async (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = await db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        const limit = parseInt(c.req.query("limit") ?? "0", 10);
        const offset = parseInt(c.req.query("offset") ?? "0", 10);

        const graph = await db.loadGraphCompact(userId);
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
    app.get("/graph/node/:id", async (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = await db.getUserId(user);
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

        const node = await db.getNodeById(nodeId, userId);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        return c.json(node);
    });

    // GET /graph/neighbors/:id — immediate neighbors by UUID
    app.get("/graph/neighbors/:id", async (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = await db.getUserId(user);
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

        const node = await db.getNodeById(nodeId, userId);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        const nextNeighbors: Record<
            string,
            { node: CompactGraphNode & { id: string }; weight: number }
        > = {};
        for (const [id, weight] of Object.entries(node.next)) {
            const neighborNode = await db.getNodeById(id, userId);
            if (neighborNode) {
                nextNeighbors[id] = { node: neighborNode, weight };
            }
        }

        const previousNeighbors: Record<
            string,
            { node: CompactGraphNode & { id: string }; weight: number }
        > = {};
        for (const [id, weight] of Object.entries(node.previous)) {
            const neighborNode = await db.getNodeById(id, userId);
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
    app.get("/graph/stats", async (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = await db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        const nodeCount = await db.getNodeCount(userId);
        const edgeCount = await db.getEdgeCount(userId);
        const graph = await db.loadGraphCompact(userId);

        return c.json({
            totalNodes: nodeCount,
            totalEdges: edgeCount,
            metadata: graph.metadata,
        });
    });

    // GET /graph/analysis — full analysis: stats, rankings, PageRank top songs, cluster summaries
    app.get("/graph/analysis", async (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = await db.getUserId(user);
        if (userId === null) {
            return c.json({ error: "User not found" }, 404);
        }

        const topN = parseInt(c.req.query("topN") ?? "20", 10);
        const graph = await db.loadGraph(userId);
        const { summary } = enrichGraph(graph, { topN });
        return c.json(summary);
    });

    // GET /graph/path — find a path between two songs (accepts UUIDs)
    app.get("/graph/path", async (c) => {
        let user: string;
        try {
            user = requireUserQuery(c);
        } catch (e: unknown) {
            const err = e as { error: string };
            return c.json({ error: err.error }, 400);
        }

        const userId = await db.getUserId(user);
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

        const graph = await db.loadGraph(userId);

        let fromKey = from;
        let toKey = to;
        if (!from.includes("::")) {
            const fromNode = await db.getNodeById(from, userId);
            if (!fromNode) return c.json({ error: "From node not found" }, 404);
            fromKey = fromNode.songKey;
        }
        if (!to.includes("::")) {
            const toNode = await db.getNodeById(to, userId);
            if (!toNode) return c.json({ error: "To node not found" }, 404);
            toKey = toNode.songKey;
        }

        const result =
            algorithm === "strongest"
                ? strongestPath(graph, fromKey as SongKey, toKey as SongKey)
                : shortestPath(graph, fromKey as SongKey, toKey as SongKey);

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

            await db.getOrCreateUser(username);

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
            if (
                err &&
                typeof err === "object" &&
                "status" in err &&
                "error" in err
            ) {
                const e = err as { error: string; status: number };
                return c.json({ error: e.error }, e.status as 400);
            }
            return c.json(
                {
                    error: `Last.fm fetch failed: ${err instanceof Error ? err.message : err}`,
                },
                500,
            );
        }
    });

    // POST /pipeline/build — Build graph from fetched data, enrich, and store in DB
    app.post("/pipeline/build", async (c) => {
        try {
            const username = await requireUsername(c);
            const userId = await db.getUserId(username);
            if (userId === null) {
                return c.json(
                    {
                        error: "User not found. Fetch data first via /pipeline/fetch/lastfm",
                    },
                    404,
                );
            }

            const { readFile } = await import("node:fs/promises");
            const { existsSync } = await import("node:fs");

            const lastfmPath = path.join(
                DATA_DIR,
                `lastfm-scrobbles-${username}.json`,
            );

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
            ) as RawScrobble[];
            const { nodeCount, edgeCount, clusterCount, pageRankConverged } =
                await buildAndSaveUserGraph(db, username, lastfmScrobbles);

            return c.json({
                status: "complete",
                nodes: nodeCount,
                edges: edgeCount,
                clusters: clusterCount,
                pageRankConverged,
            });
        } catch (err) {
            if (
                err &&
                typeof err === "object" &&
                "status" in err &&
                "error" in err
            ) {
                const e = err as { error: string; status: number };
                return c.json({ error: e.error }, e.status as 400);
            }
            return c.json(
                {
                    error: `Build failed: ${err instanceof Error ? err.message : err}`,
                },
                500,
            );
        }
    });

    // POST /pipeline/run — Queue a full pipeline run and return job id
    app.post("/pipeline/run", async (c) => {
        try {
            const username = await requireUsername(c);

            // Return existing active job instead of creating a duplicate
            const existingJobId = await db.getActiveJob(username);
            if (existingJobId) {
                return c.json({ jobId: existingJobId }, 202);
            }

            const jobId = await db.enqueuePipelineJob(username);
            if (enablePipelineWorker) {
                void pollPipelineQueue();
            }
            return c.json({ jobId }, 202);
        } catch (err) {
            if (
                err &&
                typeof err === "object" &&
                "status" in err &&
                "error" in err
            ) {
                const e = err as { error: string; status: number };
                return c.json({ error: e.error }, e.status as 400);
            }
            return c.json(
                {
                    error: `Pipeline failed: ${err instanceof Error ? err.message : err}`,
                },
                500,
            );
        }
    });

    // GET /pipeline/run/:jobId — fetch one job status
    app.get("/pipeline/run/:jobId", async (c) => {
        const jobId = c.req.param("jobId");
        const job = await db.getPipelineJob(jobId);
        if (!job) {
            return c.json({ error: "Job not found" }, 404);
        }
        return c.json(job);
    });

    // GET /pipeline/run?username=... — list job statuses for a user
    app.get("/pipeline/run", async (c) => {
        const username = c.req.query("username");
        if (!username) {
            return c.json(
                { error: "Missing required query parameter: username" },
                400,
            );
        }

        const jobs = await db.listPipelineJobs(username);
        return c.json({ jobs });
    });

    return app;
}
