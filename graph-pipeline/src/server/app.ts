import { Hono } from "hono";
import { cors } from "hono/cors";
import { GraphDatabase } from "../graph/database.js";
import type { SongKey, GraphNode } from "../graph/types.js";

export interface ServerConfig {
    dbPath: string;
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
        const nextNeighbors: Record<string, { node: GraphNode; weight: number }> = {};
        for (const [key, weight] of Object.entries(node.next)) {
            const neighborNode = db.getNode(key as SongKey);
            if (neighborNode) {
                nextNeighbors[key] = { node: neighborNode, weight };
            }
        }

        const previousNeighbors: Record<string, { node: GraphNode; weight: number }> = {};
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

    return app;
}
