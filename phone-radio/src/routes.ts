import { stat } from "node:fs/promises";
import { NCCOBuilder, Stream, Wait } from "@vonage/voice";
import { type } from "arktype";
import { Router } from "express";
import type { Request, Router as ExpressRouter } from "express";
import { voiceClient, vonageApiSecret } from "./clients.js";
import { tracks } from "./tracks.js";

export const routes: ExpressRouter = Router();

const answerPhoneRequestParser = type({
  body: {
    uuid: "string",
  },
});

routes.post("/answer", (req, res) => {
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

  const callControl = new NCCOBuilder().addAction(new Wait(2)).addAction({
    action: "input",
    type: ["dtmf"],
    mode: "asynchronous",
  });

  for (let index = 0; index < tracks.length; index++) {
    const trackUrl = new URL(`/track/${index}`, url);
    trackUrl.searchParams.set("secret", vonageApiSecret);
    callControl.addAction(new Stream(trackUrl.toString(), undefined, undefined, 1));
  }

  res.json(callControl.build());
});

const loadTrackRequestParser = type({
  params: {
    index: "string",
  },
});

routes.get("/track/:index", async (req, res) => {
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

function baseUrl(req: Request): string {
  const proto = req.header("x-forwarded-proto") ?? req.protocol;
  const host = req.header("x-forwarded-host") ?? req.header("host");
  return `${proto}://${host}`;
}
