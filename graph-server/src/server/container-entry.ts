import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
}

const port = parseInt(process.env.PORT ?? "8080", 10);
const dbHost = new URL(databaseUrl).hostname;

const app = createApp({ databaseUrl, enablePipelineWorker: false });

console.log(`Container starting on port ${port}`);
console.log(`Database host: ${dbHost}`);

serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Listening on http://0.0.0.0:${info.port}`);
});
