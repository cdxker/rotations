import "dotenv/config";
import express from "express";
import { pinoHttp } from "pino-http";
import { routes } from "./routes.js";
import { env } from "./env.js";

const app = express();

app.use(pinoHttp());
app.use(express.json());
app.use(routes);

app.listen(env.PORT, () => {
  console.log(`Phone radio server listening on http://localhost:${env.PORT}`);
});
