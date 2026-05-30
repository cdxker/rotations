import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type } from "arktype";
import { cleanEnv, str } from "envalid";
import { NCCOBuilder, Stream, Voice, Wait } from "@vonage/voice";
import type { Request, Response } from "express";
import { baseUrl } from "../utils/baseUrl.js";

const env = cleanEnv(process.env, {
  VONAGE_API_SECRET: str(),
  VONAGE_APPLICATION_ID: str(),
  VONAGE_PRIVATE_KEY_PATH: str({ default: "./private.key" }),
});

export const trackIndexes = [0, 1, 2, 3];

export const voiceClient = new Voice({
  applicationId: env.VONAGE_APPLICATION_ID,
  privateKey: readFileSync(resolve(env.VONAGE_PRIVATE_KEY_PATH), "utf8"),
});

const answerRequest = type({
  query: {
    "uuid?": "string",
  },
  body: {
    "uuid?": "string",
  },
});

export function phoneRadio(req: Request, res: Response): void {
  const parsedRequest = answerRequest({ query: req.query, body: req.body });
  const url = baseUrl(req);

  if (parsedRequest instanceof type.errors) {
    res.status(400).json({ error: `Invalid Vonage answer request: ${parsedRequest.summary}` });
    return;
  }

  const uuid = parsedRequest.query.uuid ?? parsedRequest.body.uuid ?? "";

  if (!uuid) {
    res.status(400).json({ error: "Missing Vonage call uuid." });
    return;
  }


  setTimeout(() => {

    const digitPressUrl = new URL("/handleDigitPress", url);
    digitPressUrl.searchParams.set("uuid", uuid);

    void voiceClient.subscribeDTMF(uuid, digitPressUrl.toString()).catch((error: unknown) => {
      req.log.error({ error }, "Failed to subscribe to Vonage DTMF events");
    });

  }, 1_000);

  setTimeout(() => {
    void voiceClient.playDTMF(uuid, "1");
  }, 1_000);

  const ncco = new NCCOBuilder()
    .addAction(new Wait(2))
    .addAction({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
    });

  for (const index of trackIndexes) {
    const trackUrl = new URL(`/track/${index}`, url);
    trackUrl.searchParams.set("secret", env.VONAGE_API_SECRET);
    ncco.addAction(new Stream(trackUrl.toString(), undefined, undefined, 1));
  }

  res.json(ncco.build());
}
