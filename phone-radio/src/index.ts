import "dotenv/config";
import express from "express";
import { pinoHttp } from "pino-http";
import { routes } from "./routes.js";

const app = express();
const port = 3010;

app.use(pinoHttp());
app.use(express.json());
app.use(routes);

app.listen(port, () => {
  console.log(`Phone radio server listening on http://localhost:${port}`);
});
