import "dotenv/config";
import express from "express";
import { pinoHttp } from "pino-http";
import { routes } from "./routes.js";
import { env } from "./env.js";

declare global {
  namespace Express {
    interface Request {
      locals: {
        baseUrl: string;
      };
    }
  }
}

const app = express();

app.use(
  pinoHttp({
    quietReqLogger: true,
    transport: {
      target: "pino-pretty",
    },
  }),
);
app.use(express.json());
app.use((req, _res, next) => {
  const proto = req.header("x-forwarded-proto") ?? req.protocol;
  const host = req.header("x-forwarded-host") ?? req.header("host");
  req.locals = {
    baseUrl: `${proto}://${host}`,
  };
  next();
});
app.use(routes);

app.listen(env.PORT, () => {
  console.log(`Phone radio server listening on http://localhost:${env.PORT}`);
});
