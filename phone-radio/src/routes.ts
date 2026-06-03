import { stat } from "node:fs/promises";
import { NCCOBuilder, Notify, Stream, Wait } from "@vonage/voice";
import { type } from "arktype";
import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import { redisClient, voiceClient, vonageApiSecret } from "./clients.js";
import { tracks } from "./tracks.js";

export const routes: ExpressRouter = Router();

const answerPhoneRequestParser = type({
  body: {
    uuid: "string",
  },
  locals: {
    baseUrl: "string",
  },
});

routes.post("/answer", async (req, res) => {
  const request = answerPhoneRequestParser(req);

  if (request instanceof type.errors) {
    res.status(400).json({
      error: `Invalid Vonage answer request: ${request.summary}`,
    });
    return;
  }
  const {
    body: { uuid },
    locals: { baseUrl: url },
  } = request;

  await redisClient.set(`listener:${uuid}:track`, "0");

  setTimeout(() => {
    const digitPressUrl = new URL("/input/digit", url);
    digitPressUrl.searchParams.set("uuid", uuid);

    void voiceClient.subscribeDTMF(uuid, digitPressUrl.toString());
  }, 1_000);

  setTimeout(() => {
    void voiceClient.playDTMF(uuid, "1");
  }, 5_000);

  const callControl = new NCCOBuilder()
    .addAction(new Wait(2))
    .addAction({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: [`${url}/input/digit?uuid=${uuid}`],
      eventMethod: "POST",
    })
    .addAction(new Stream(`${url}/track/0?secret=${vonageApiSecret}`))
    .addAction(new Notify({ uuid }, `${url}/track/finished/${uuid}/0`, "POST"));

  res.json(callControl.build());
});

const finishedTrackRequestParser = type({
  params: {
    uuid: "string",
    songIndex: "string",
  },
  locals: {
    baseUrl: "string",
  },
});

routes.post("/track/finished/:uuid/:songIndex", async (req, res) => {
  const request = finishedTrackRequestParser(req);
  if (request instanceof type.errors) {
    res.status(400).json({
      error: request.summary,
    });
    return;
  }

  const {
    params: { songIndex, uuid },
    locals: { baseUrl: url },
  } = request;

  const finishedTrackIndex = parseInt(songIndex);
  const currentTrackIndex = parseInt(
    (await redisClient.get(`listener:${uuid}:track`)) ?? "",
  );

  if (!Number.isInteger(finishedTrackIndex)) {
    res.status(400).json({
      error: "Invalid finished track index.",
    });
    return;
  }

  if (currentTrackIndex !== finishedTrackIndex) {
    req.log.info(
      { currentTrackIndex, finishedTrackIndex, uuid },
      "Ignored duplicate finished track webhook",
    );
    res.status(204).send();
    return;
  }

  const nextTrackIndex =
    Number.isInteger(currentTrackIndex) && tracks.length > 0
      ? (currentTrackIndex + 1) % tracks.length
      : 0;

  await redisClient.set(`listener:${uuid}:track`, nextTrackIndex.toString());

  const callControl = new NCCOBuilder()
    .addAction({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: [`${url}/input/digit?uuid=${uuid}`],
      eventMethod: "POST",
    })
    .addAction(
      new Stream(`${url}/track/${nextTrackIndex}?secret=${vonageApiSecret}`),
    )
    .addAction(
      new Notify({}, `${url}/track/finished/${uuid}/${nextTrackIndex}`, "POST"),
    );

  res.json(callControl.build());
});

const digitInputRequestParser = type({
  query: {
    uuid: "string",
  },
  body: {
    "digit?": "string",
    "dtmf?": {
      "digits?": "string",
    },
  },
  locals: {
    baseUrl: "string",
  },
});

routes.post("/input/digit", async (req, res) => {
  const request = digitInputRequestParser(req);
  if (request instanceof type.errors) {
    res.status(400).json({
      error: request.summary,
    });
    return;
  }

  const {
    locals: { baseUrl: url },
    query: { uuid },
  } = request;

  const digit = request.body.digit ?? request.body.dtmf?.digits;

  if (digit === "1" || digit === "2") {
    const currentTrackIndex = parseInt(
      (await redisClient.get(`listener:${uuid}:track`)) ?? "",
    );
    const nextTrackIndex =
      Number.isInteger(currentTrackIndex) && tracks.length > 0
        ? digit === "1"
          ? (currentTrackIndex - 1 + tracks.length) % tracks.length
          : (currentTrackIndex + 1) % tracks.length
        : 0;

    const nextCallControl = new NCCOBuilder()
      .addAction({
        action: "input",
        type: ["dtmf"],
        mode: "asynchronous",
        eventUrl: [`${url}/input/digit?uuid=${uuid}`],
        eventMethod: "POST",
      })
      .addAction({
        action: "talk",
        text: `Song ${nextTrackIndex + 1}.`,
      })
      .addAction(
        new Stream(
          `${url}/track/${nextTrackIndex}?secret=${vonageApiSecret}`,
          undefined,
          undefined,
          1,
        ),
      )
      .addAction(
        new Notify(
          { uuid },
          `${url}/track/finished/${uuid}/${nextTrackIndex}`,
          "POST",
        ),
      )
      .build();

    try {
      await voiceClient.transferCallWithNCCO(uuid, nextCallControl);

      await redisClient.set(
        `listener:${uuid}:track`,
        nextTrackIndex.toString(),
      );

      req.log.info(
        { digit, uuid, nextTrackIndex },
        "Transferred call to queued phone radio track",
      );

      res.status(204).send();
    } catch (error: unknown) {
      req.log.error(
        { error, uuid, nextTrackIndex },
        "Failed to transfer call to queued phone radio track",
      );
      res.status(502).json({
        error: "Failed to transfer call to queued track.",
      });
    }
  }
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
