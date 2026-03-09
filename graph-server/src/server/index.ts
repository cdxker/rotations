import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = parseInt(process.env.GRAPH_SERVER_PORT ?? "3003", 10);
const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/graph";

const app = createApp({ databaseUrl, enablePipelineWorker: true });

console.log(`Graph API server starting on http://localhost:${port}`);
console.log(`Database: ${databaseUrl}`);

serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
});
