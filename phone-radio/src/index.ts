import "dotenv/config";
import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { NCCOBuilder, Stream, Voice, Wait } from "@vonage/voice";
import { type } from "arktype";
import { cleanEnv, str } from "envalid";
import express from "express";
import type { Request, Response } from "express";
import { pinoHttp } from "pino-http";

const env = cleanEnv(process.env, {
  VONAGE_API_SECRET: str(),
  VONAGE_APPLICATION_ID: str(),
  VONAGE_PRIVATE_KEY_PATH: str({ default: "./private.key" }),
});

export const voiceClient = new Voice({
  applicationId: env.VONAGE_APPLICATION_ID,
  privateKey: readFileSync(resolve(env.VONAGE_PRIVATE_KEY_PATH), "utf8"),
});

const app = express();
const port = 3010;

app.use(pinoHttp());
app.use(express.json());

const tracks = [
  "/home/cdxker/Music/Drake/DRAKE  - JANICE STFU (LYRICS⧸LETRA) english-spanish [NlfyxSKrjA0].mp3"
];

// Answer phone 
// 

const answerPhoneRequestParser = type({
  body: {
    uuid: "string",
  },
});

app.post("/answer", (req: Request, res: Response) => {
  const request = answerPhoneRequestParser(req);
  const url = baseUrl(req);

  if (request instanceof type.errors) {
    res.status(400).json({
      error: `Invalid Vonage answer request: ${request.summary}`,
    });
    return;
  }
  const { uuid } = request.body;

  setTimeout(() => {
    const digitPressUrl = new URL("/handleDigitPress", url);
    digitPressUrl.searchParams.set("uuid", uuid);

    void voiceClient
      .subscribeDTMF(uuid, digitPressUrl.toString())
      .catch((error: unknown) => {
        req.log.error({ error }, "Failed to subscribe to Vonage DTMF events");
      });
  }, 1_000);

  setTimeout(() => {
    void voiceClient.playDTMF(uuid, "1");
  }, 5_000);

  const ncco = new NCCOBuilder().addAction(new Wait(2)).addAction({
    action: "input",
    type: ["dtmf"],
    mode: "asynchronous",
  });

  for (let index = 0; index < 4; index++) {
    const trackUrl = new URL(`/track/${index}`, url);
    trackUrl.searchParams.set("secret", env.VONAGE_API_SECRET);
    ncco.addAction(new Stream(trackUrl.toString(), undefined, undefined, 1));
  }

  res.json(ncco.build());
});


/// Load Track

const loadTrackRequestParser = type({
  params: {
    index: "string",
  },
});

app.get("/track/:index", async (req: Request, res: Response) => {
  const request = loadTrackRequestParser(req);
  if (request instanceof type.errors) {
    res.status(400).json({
      error: request.summary,
    });
    return;
  }

  const { index } = request.params;
  const trackPath = tracks[parseInt(index)];

  if (!trackPath) {
    res.status(404).send("Track not found.");
    return;
  }

  try {
    const trackStat = await stat(trackPath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", trackStat.size.toString());
    res.sendFile(trackPath);
  } catch {
    res.status(404).send("Track file not found.");
  }
});

app.listen(port, () => {
  console.log(`Phone radio server listening on http://localhost:${port}`);
});


  // utils

function baseUrl(req: Request): string {
  const proto = req.header("x-forwarded-proto") ?? req.protocol;
  const host = req.header("x-forwarded-host") ?? req.header("host");
  return `${proto}://${host}`;
}
