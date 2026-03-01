import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { GraphDatabase } from "../graph/database.js";
import type { SongKey, GraphNode } from "../graph/types.js";
import { enrichGraph } from "../analysis/enrich.js";
import { shortestPath, strongestPath } from "../analysis/paths.js";
import { LastfmClient } from "../ingestion/lastfm-client.js";
import { fetchLastfmScrobbles } from "../ingestion/lastfm-fetcher.js";
import { SpotifyAuth } from "../ingestion/spotify-auth.js";
import { SpotifyClient } from "../ingestion/spotify-client.js";
import { buildGraph } from "../graph/build-graph.js";
import { loadLastfmConfig } from "../config.js";

const DATA_DIR = path.join(import.meta.dirname, "../../data");

export interface ServerConfig {
    dbPath: string;
}

/** Run an async handler, catching errors and returning a 500 JSON response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pipelineHandler(c: any, label: string, fn: () => Promise<any>) {
    try {
        return await fn();
    } catch (err) {
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
        const limit = parseInt(c.req.query("limit") ?? "0", 10);
        const offset = parseInt(c.req.query("offset") ?? "0", 10);

        const graph = db.loadGraph();
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
        const songKey = decodeURIComponent(c.req.param("songKey")) as SongKey;

        if (!songKey || !songKey.includes("::")) {
            return c.json(
                { error: "Invalid songKey format. Expected: artist::track" },
                400,
            );
        }

        const node = db.getNode(songKey);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        return c.json({ songKey, ...node });
    });

    // GET /graph/neighbors/:songKey — immediate neighbors (next + previous)
    app.get("/graph/neighbors/:songKey", (c) => {
        const songKey = decodeURIComponent(c.req.param("songKey")) as SongKey;

        if (!songKey || !songKey.includes("::")) {
            return c.json(
                { error: "Invalid songKey format. Expected: artist::track" },
                400,
            );
        }

        const node = db.getNode(songKey);
        if (!node) {
            return c.json({ error: "Node not found" }, 404);
        }

        // Fetch full node data for each neighbor
        const nextNeighbors: Record<
            string,
            { node: GraphNode; weight: number }
        > = {};
        for (const [key, weight] of Object.entries(node.next)) {
            const neighborNode = db.getNode(key as SongKey);
            if (neighborNode) {
                nextNeighbors[key] = { node: neighborNode, weight };
            }
        }

        const previousNeighbors: Record<
            string,
            { node: GraphNode; weight: number }
        > = {};
        for (const [key, weight] of Object.entries(node.previous)) {
            const neighborNode = db.getNode(key as SongKey);
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
        const nodeCount = db.getNodeCount();
        const edgeCount = db.getEdgeCount();
        const graph = db.loadGraph();

        return c.json({
            totalNodes: nodeCount,
            totalEdges: edgeCount,
            metadata: graph.metadata,
        });
    });

    // GET /graph/analysis — full analysis: stats, rankings, PageRank top songs, cluster summaries
    app.get("/graph/analysis", (c) => {
        const topN = parseInt(c.req.query("topN") ?? "20", 10);
        const graph = db.loadGraph();
        const { summary } = enrichGraph(graph, { topN });
        return c.json(summary);
    });

    // GET /graph/path — find a path between two songs
    app.get("/graph/path", (c) => {
        const from = c.req.query("from");
        const to = c.req.query("to");
        const algorithm = c.req.query("algorithm") ?? "shortest";

        if (!from || !to) {
            return c.json(
                { error: "Both 'from' and 'to' query parameters are required" },
                400,
            );
        }

        if (!from.includes("::") || !to.includes("::")) {
            return c.json(
                { error: "Invalid songKey format. Expected: artist::track" },
                400,
            );
        }

        if (algorithm !== "shortest" && algorithm !== "strongest") {
            return c.json(
                { error: "Algorithm must be 'shortest' or 'strongest'" },
                400,
            );
        }

        const graph = db.loadGraph();
        const result =
            algorithm === "strongest"
                ? strongestPath(graph, from as SongKey, to as SongKey)
                : shortestPath(graph, from as SongKey, to as SongKey);

        return c.json(result);
    });

    // ===== Pipeline Routes =====

    // POST /pipeline/spotify/auth — Start Spotify OAuth flow (opens browser)
    app.post("/pipeline/spotify/auth", (c) =>
        pipelineHandler(c, "Spotify auth failed", async () => {
            const auth = new SpotifyAuth();
            if (await auth.hasTokens()) {
                return c.json({
                    status: "already_authorized",
                    message:
                        "Spotify tokens already exist. Use /pipeline/spotify/refresh to refresh.",
                });
            }
            await auth.authorize();
            return c.json({
                status: "authorized",
                message: "Spotify OAuth completed successfully.",
            });
        }),
    );

    // POST /pipeline/fetch/lastfm — Fetch scrobble history from Last.fm
    app.post("/pipeline/fetch/lastfm", (c) =>
        pipelineHandler(c, "Last.fm fetch failed", async () => {
            const config = loadLastfmConfig();
            const client = new LastfmClient(config);
            await client.verifyAuth();

            const logs: string[] = [];
            const scrobbles = await fetchLastfmScrobbles(client, {
                onProgress: (msg) => logs.push(msg),
            });

            return c.json({
                status: "complete",
                scrobbleCount: scrobbles.length,
                logs,
            });
        }),
    );

    // POST /pipeline/fetch/spotify — Fetch recently played + playlists from Spotify
    app.post("/pipeline/fetch/spotify", (c) =>
        pipelineHandler(c, "Spotify fetch failed", async () => {
            const auth = new SpotifyAuth();
            if (!(await auth.hasTokens())) {
                return c.json(
                    {
                        error: "Not authorized. Call POST /pipeline/spotify/auth first.",
                    },
                    400,
                );
            }
            const client = new SpotifyClient(auth);
            const dump = await client.fetchAll();
            await client.exportToJson(path.join(DATA_DIR, "spotify-dump.json"), dump);

            return c.json({
                status: "complete",
                recentlyPlayed: dump.recentlyPlayed.length,
                playlistTracks: dump.playlistTracks.length,
            });
        }),
    );

    // POST /pipeline/build — Build graph from fetched data, enrich, and store in DB
    app.post("/pipeline/build", (c) =>
        pipelineHandler(c, "Build failed", async () => {
            const { readFile } = await import("node:fs/promises");
            const { existsSync } = await import("node:fs");

            const lastfmPath = path.join(DATA_DIR, "lastfm-scrobbles.json");
            const spotifyPath = path.join(DATA_DIR, "spotify-dump.json");

            if (!existsSync(lastfmPath) && !existsSync(spotifyPath)) {
                return c.json(
                    {
                        error: "No data found. Fetch data first via /pipeline/fetch/lastfm or /pipeline/fetch/spotify",
                    },
                    400,
                );
            }

            let lastfmScrobbles;
            if (existsSync(lastfmPath)) {
                lastfmScrobbles = JSON.parse(
                    await readFile(lastfmPath, "utf-8"),
                );
            }

            let spotifyDump;
            if (existsSync(spotifyPath)) {
                spotifyDump = JSON.parse(await readFile(spotifyPath, "utf-8"));
            }

            const lastfmConfig = (() => {
                try {
                    return loadLastfmConfig();
                } catch {
                    return null;
                }
            })();

            const graph = buildGraph({
                lastfmScrobbles,
                spotifyRecentTracks: spotifyDump?.recentlyPlayed,
                spotifyPlaylistTracks: spotifyDump?.playlistTracks,
                lastfmUsername: lastfmConfig?.username,
            });

            const { summary } = enrichGraph(graph);
            db.clearGraph();
            db.saveGraph(graph);

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

    // POST /pipeline/run — Run the full pipeline (Last.fm only, Spotify requires separate auth)
    app.post("/pipeline/run", (c) =>
        pipelineHandler(c, "Pipeline failed", async () => {
            const steps: string[] = [];

            const config = loadLastfmConfig();
            const client = new LastfmClient(config);
            await client.verifyAuth();
            steps.push("Last.fm auth verified");

            const scrobbles = await fetchLastfmScrobbles(client);
            steps.push(`Fetched ${scrobbles.length} scrobbles from Last.fm`);

            let spotifyDump = null;
            const auth = new SpotifyAuth();
            if (await auth.hasTokens()) {
                const spotifyClient = new SpotifyClient(auth);
                spotifyDump = await spotifyClient.fetchAll();
                steps.push(
                    `Fetched ${spotifyDump.recentlyPlayed.length} recent + ${spotifyDump.playlistTracks.length} playlist tracks from Spotify`,
                );
            } else {
                steps.push(
                    "Spotify not authorized — skipping. Call POST /pipeline/spotify/auth to set up.",
                );
            }

            const graph = buildGraph({
                lastfmScrobbles: scrobbles,
                spotifyRecentTracks: spotifyDump?.recentlyPlayed,
                spotifyPlaylistTracks: spotifyDump?.playlistTracks,
                lastfmUsername: config.username,
            });
            steps.push(`Built graph: ${Object.keys(graph.nodes).length} nodes`);

            const { summary } = enrichGraph(graph);
            steps.push(
                `Enriched: ${summary.clusters.clusterCount} clusters, PageRank converged=${summary.pageRank.converged}`,
            );

            db.clearGraph();
            db.saveGraph(graph);
            steps.push("Saved to database");

            return c.json({ status: "complete", steps });
        }),
    );

    return app;
}
