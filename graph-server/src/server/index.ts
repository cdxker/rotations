import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = parseInt(process.env.GRAPH_SERVER_PORT ?? "3001", 10);
const dbPath = process.env.GRAPH_DB_PATH ?? "graph.db";

const app = createApp({ dbPath, enablePipelineWorker: true });

console.log(`Graph API server starting on http://localhost:${port}`);
console.log(`Database: ${dbPath}`);

serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
});
