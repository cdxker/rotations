import { NCCOBuilder, Notify, Stream, Wait } from "@vonage/voice";
import { type } from "arktype";
import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import { voiceClient, vonageApiSecret } from "./clients.js";
import { playlistService, type PlaylistTrack } from "./playlist.service.js";

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

  await playlistService.startPlaylist(uuid);

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
  if (!Number.isInteger(finishedTrackIndex)) {
    res.status(400).json({
      error: "Invalid finished track index.",
    });
    return;
  }

  const nextTrack = await playlistService.trackFinished(uuid, finishedTrackIndex);

  if (nextTrack === null) {
    req.log.info(
      { finishedTrackIndex, uuid },
      "Ignored duplicate finished track webhook",
    );
    res.status(204).send();
    return;
  }

  const callControl = new NCCOBuilder()
    .addAction({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: [`${url}/input/digit?uuid=${uuid}`],
      eventMethod: "POST",
    })
    .addAction(
      new Stream(`${url}/track/${nextTrack.index}?secret=${vonageApiSecret}`),
    )
    .addAction(
      new Notify({}, `${url}/track/finished/${uuid}/${nextTrack.index}`, "POST"),
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

  let nextTrack: PlaylistTrack | null = null;

  if (digit !== "1" && digit !== "2") {
    res.status(400).json({
      error: "Invalid digit.",
    });
    return;
  }

  if (digit === "1") {
    nextTrack = await playlistService.toPreviousTrack(uuid);
  }

  if (digit === "2") {
    nextTrack = await playlistService.toNextTrack(uuid);
  }

  if (nextTrack === null) {
    res.status(404).json({
      error: "Current track could not be found.",
    });
    return;
  }

  const nextCallControl = new NCCOBuilder()
    .addAction({
      action: "talk",
      text: `Song ${nextTrack.index + 1}.`,
    })
    .addAction({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: [`${url}/input/digit?uuid=${uuid}`],
      eventMethod: "POST",
    })
    .addAction(
      new Stream(`${url}/track/${nextTrack.index}?secret=${vonageApiSecret}`),
    )
    .addAction(
      new Notify(
        { uuid },
        `${url}/track/finished/${uuid}/${nextTrack.index}`,
        "POST",
      ),
    )
    .build();

  try {
    await voiceClient.transferCallWithNCCO(uuid, nextCallControl);

    req.log.info(
      { digit, uuid, nextTrackIndex: nextTrack.index },
      "Transferred call to queued phone radio track",
    );

    res.status(204).send();
  } catch (error: unknown) {
    req.log.error(
      { error, uuid, nextTrackIndex: nextTrack.index },
      "Failed to transfer call to queued phone radio track",
    );
    res.status(502).json({
      error: "Failed to transfer call to queued track.",
    });
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

  const track = await playlistService.getTrackPath(parseInt(index));

  if (!track) {
    res.status(404).send("Track not found.");
    return;
  }

  try {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", track.fileSize.toString());
    res.sendFile(track.filePath);
  } catch {
    res.status(404).send("Track file not found.");
  }
});
