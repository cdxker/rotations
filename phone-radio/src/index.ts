import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { pino, destination } from "pino";
import { pinoHttp } from "pino-http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { discordBridgeManager, discordRuntime, redisClient, voiceClient } from "./clients.js";
import { routes } from "./routes.js";
import { agentConfig, discordBridgeConfig, env } from "./env.js";
import { agentBridgeManager } from "./agent/runtime.js";
import { playlistService } from "./playlist.service.js";
import { buildTrackNcco } from "./utils/buildTrackNcco.js";

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

function authorizationMatches(request: IncomingMessage, secret: string): boolean {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return false;
  const actual = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  return Buffer.from(data);
}

const serverShutdowns = new WeakMap<Server, () => Promise<void>>();

export function stopPhoneRadioServer(server: Server): Promise<void> {
  const shutdown = serverShutdowns.get(server);
  if (!shutdown) return Promise.reject(new Error("Unknown phone-radio server."));
  return shutdown();
}

export function createPhoneRadioServer() {
  const server = createServer(app);
  const websocketServer = new WebSocketServer({ noServer: true });

  const agentWebsocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const uuid = url.searchParams.get("uuid");
    if (url.pathname === "/agent/audio") {
      const sessionId = url.searchParams.get("sessionId");
      if (!agentConfig.enabled || !uuid || !sessionId ||
          !authorizationMatches(request, agentConfig.websocketSecret) ||
          !agentBridgeManager.hasReservation(uuid, sessionId)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      agentWebsocketServer.handleUpgrade(request, socket, head, (websocket) => {
        void agentBridgeManager.attach(uuid, sessionId, websocket).catch(() => {
          websocket.close(1011, "Agent connection failed");
        });
      });
      return;
    }
    if (
      url.pathname !== "/discord/audio" ||
      !uuid ||
      !discordBridgeConfig.enabled ||
      !authorizationMatches(request, discordBridgeConfig.websocketSecret) ||
      !discordBridgeManager.hasReservation(uuid)
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request, uuid);
    });
  });

  websocketServer.on(
    "connection",
    async (websocket: WebSocket, request: IncomingMessage, uuid: string) => {
    try {
      const attached = await discordBridgeManager.attach(uuid, websocket);
      if (attached.kind !== "attached") {
        console.warn(
          `Discord bridge unavailable for call ${uuid}: ${attached.kind}.`,
        );
        websocket.close(1008, "Bridge unavailable");
        if (attached.kind === "busy") {
          await returnToMusic(
            uuid,
            request,
            "That Discord server is busy in another voice channel.",
          );
        }
        return;
      }
      console.info(`Discord bridge attached for call ${uuid}.`);
      websocket.on("message", (data: RawData, isBinary: boolean) => {
        if (isBinary) {
          discordBridgeManager.writePhoneAudio(uuid, rawDataToBuffer(data));
        }
      });
      const release = () => {
        void discordBridgeManager.detach(uuid);
        void playlistService.returnToPlaybackIfDiscord(uuid);
      };
      websocket.once("close", release);
      websocket.once("error", release);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "unknown error";
      console.error(`Discord bridge setup failed for call ${uuid}: ${reason}`);
      websocket.close(1011, "Bridge setup failed");
      await returnToMusic(
        uuid,
        request,
        "Discord connection failed. Returning to music.",
      );
    }
    },
  );
  let shutdownPromise: Promise<void> | undefined;
  serverShutdowns.set(server, () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      // Stop accepting calls first, but close upgraded sockets before waiting
      // for the HTTP close event, which otherwise waits on those sockets.
      const httpClosed = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
          else resolve();
        });
      });
      const agentClosed = agentBridgeManager.close();
      const discordClosed = discordBridgeManager.close();
      for (const client of [...agentWebsocketServer.clients, ...websocketServer.clients]) client.terminate();
      await Promise.all([agentClosed, discordClosed, httpClosed]);
    })();
    return shutdownPromise;
  });
  server.once("close", () => {
    void agentBridgeManager.close();
    agentWebsocketServer.close();
    websocketServer.close();
    void discordBridgeManager.close();
    discordRuntime.stop();
  });
  return server;
}

async function returnToMusic(
  uuid: string,
  request: IncomingMessage,
  message: string,
): Promise<void> {
  const changed = await playlistService.returnToPlaybackIfDiscord(uuid);
  if (!changed) return;
  const track = await playlistService.getCurrentTrack(uuid);
  if (!track) return;
  const proto = request.headers["x-forwarded-proto"] ?? "https";
  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  if (!host) return;
  await voiceClient.transferCallWithNCCO(
    uuid,
    buildTrackNcco({
      url: `${proto}://${host}`,
      uuid,
      playlistNumber: track.playlistNumber,
      trackIndex: track.index,
      catalogRevision: track.catalogRevision,
      announceTrack: false,
      messages: [message],
    }),
  );
}

export function startPhoneRadioServer(port = env.PORT) {
  const server = createPhoneRadioServer();
  const shutdown = () => {
    void stopPhoneRadioServer(server).catch(() => {
      console.error("Phone radio shutdown failed.");
      process.exitCode = 1;
    }).finally(() => redisClient.disconnect());
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.once("close", () => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
  });
  server.listen(port, () => {
    console.log(`Phone radio server listening on http://localhost:${port}`);
    if (discordBridgeConfig.enabled) {
      void discordRuntime.start().then((available) => {
        if (available) {
          const availableCodes = discordBridgeConfig.destinations
            .filter(({ code }) => discordRuntime.isDestinationAvailable(code))
            .map(({ code }) => code)
            .join(", ");
          console.info(
            `Discord voice bridge is available for codes: ${availableCodes}.`,
          );
          return;
        }
        console.error(
          "Discord voice bridge is unavailable; calls will return to music.",
        );
      });
    }
  });
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startPhoneRadioServer();
}
