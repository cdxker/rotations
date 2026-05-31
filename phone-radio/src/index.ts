import "dotenv/config";
import express from "express";
import { pino, destination } from "pino";
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
    logger: pino(
      {
        level: "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,reqId,req,res,responseTime",
          },
        },
      },
      destination(1),
    ),
    quietReqLogger: true,
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          userAgent: req.headers["user-agent"],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
    customSuccessMessage(req, res, responseTime) {
      return `${res.statusCode} ${res.statusMessage} ${req.method} ${req.url} ${responseTime}ms`;
    },
    customErrorMessage(req, res, error) {
      return `${res.statusCode} ${res.statusMessage} ${req.method} ${req.url}: ${error.message}`;
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
