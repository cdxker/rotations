import { type } from "arktype";
import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import { voiceClient } from "./clients.js";
import { playlistService, type PlaylistTrack } from "./playlist.service.js";
import { buildPlaylistSelectionNcco } from "./utils/buildPlaylistSelectionNcco.js";
import { buildTrackNcco } from "./utils/buildTrackNcco.js";

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
  const currentTrack = await playlistService.getCurrentTrack(uuid);

  if (!currentTrack) {
    res.status(404).json({
      error: "Default playlist track could not be found.",
    });
    return;
  }

  setTimeout(() => {
    const digitPressUrl = new URL("/input/digit", url);
    digitPressUrl.searchParams.set("uuid", uuid);

    void voiceClient.subscribeDTMF(uuid, digitPressUrl.toString());
  }, 1_000);

  setTimeout(() => {
    void voiceClient.playDTMF(uuid, "1");
  }, 5_000);

  res.json(
    buildTrackNcco({
      url,
      uuid,
      playlistNumber: currentTrack.playlistNumber,
      trackIndex: currentTrack.index,
      announceTrack: false,
    }),
  );
});

const finishedTrackRequestParser = type({
  params: {
    uuid: "string",
    playlistNumber: "string",
    songIndex: "string",
  },
  locals: {
    baseUrl: "string",
  },
});

routes.post(
  "/track/finished/:uuid/:playlistNumber/:songIndex",
  async (req, res) => {
    const request = finishedTrackRequestParser(req);
    if (request instanceof type.errors) {
      res.status(400).json({
        error: request.summary,
      });
      return;
    }

    const {
      params: { playlistNumber, songIndex, uuid },
      locals: { baseUrl: url },
    } = request;

    const finishedTrackIndex = parseInt(songIndex);
    if (!Number.isInteger(finishedTrackIndex)) {
      res.status(400).json({
        error: "Invalid finished track index.",
      });
      return;
    }

    const nextTrack = await playlistService.trackFinished(
      uuid,
      playlistNumber,
      finishedTrackIndex,
    );

    if (nextTrack === null) {
      req.log.info(
        { finishedPlaylistNumber: playlistNumber, finishedTrackIndex, uuid },
        "Ignored duplicate finished track webhook",
      );
      res.status(204).send();
      return;
    }

    res.json(
      buildTrackNcco({
        url,
        uuid,
        playlistNumber: nextTrack.playlistNumber,
        trackIndex: nextTrack.index,
        announceTrack: false,
      }),
    );
  },
);

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

  if (digit !== "1" && digit !== "2" && digit !== "#") {
    res.status(400).json({
      error: "Invalid digit.",
    });
    return;
  }

  if (digit === "#") {
    try {
      await playlistService.startPlaylistSelection(uuid);
      await voiceClient.transferCallWithNCCO(
        uuid,
        buildPlaylistSelectionNcco({ url, uuid }),
      );

      req.log.info({ digit, uuid }, "Transferred call to playlist selector");
      res.status(204).send();
    } catch (error: unknown) {
      req.log.error(
        { error, uuid },
        "Failed to transfer call to playlist selector",
      );
      await playlistService.resumePlayback(uuid);
      res.status(502).json({
        error: "Failed to transfer call to playlist selector.",
      });
    }
    return;
  }

  if (digit === "1") {
    nextTrack = await playlistService.getPreviousTrack(uuid);
  }

  if (digit === "2") {
    nextTrack = await playlistService.getNextTrack(uuid);
  }

  if (nextTrack === null) {
    res.status(404).json({
      error: "Current track could not be found.",
    });
    return;
  }

  try {
    await voiceClient.transferCallWithNCCO(
      uuid,
      buildTrackNcco({
        url,
        uuid,
        playlistNumber: nextTrack.playlistNumber,
        trackIndex: nextTrack.index,
        announceTrack: true,
      }),
    );

    const committedTrack = await playlistService.commitTrack(
      uuid,
      nextTrack.playlistNumber,
      nextTrack.index,
    );

    if (committedTrack === null) {
      req.log.error(
        { uuid, nextTrackIndex: nextTrack.index },
        "Failed to commit queued phone radio track after transfer",
      );
      res.status(500).json({
        error: "Failed to commit queued track.",
      });
      return;
    }

    req.log.info(
      {
        digit,
        nextPlaylistNumber: nextTrack.playlistNumber,
        nextTrackIndex: nextTrack.index,
        uuid,
      },
      "Transferred call to queued phone radio track",
    );

    res.status(204).send();
  } catch (error: unknown) {
    req.log.error(
      {
        error,
        nextPlaylistNumber: nextTrack.playlistNumber,
        nextTrackIndex: nextTrack.index,
        uuid,
      },
      "Failed to transfer call to queued phone radio track",
    );
    res.status(502).json({
      error: "Failed to transfer call to queued track.",
    });
  }
});

const playlistInputRequestParser = type({
  query: {
    uuid: "string",
  },
  body: {
    "digits?": "string",
    "dtmf?": {
      "digits?": "string",
    },
  },
  locals: {
    baseUrl: "string",
  },
});

routes.post("/input/playlist", async (req, res) => {
  const request = playlistInputRequestParser(req);
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

  const playlistNumber = request.body.digits ?? request.body.dtmf?.digits;
  const selectedTrack = await playlistService.switchPlaylistByNumber(
    uuid,
    playlistNumber,
  );

  if (selectedTrack) {
    res.json(
      buildTrackNcco({
        url,
        uuid,
        playlistNumber: selectedTrack.playlistNumber,
        trackIndex: selectedTrack.index,
        announceTrack: true,
        messages: [`Playlist ${selectedTrack.playlistName}.`],
      }),
    );
    return;
  }

  const currentTrack = await playlistService.getCurrentTrack(uuid);

  if (!currentTrack) {
    await playlistService.resumePlayback(uuid);
    res.status(404).json({
      error: "Current track could not be found.",
    });
    return;
  }

  await playlistService.resumePlayback(uuid);

  res.json(
    buildTrackNcco({
      url,
      uuid,
      playlistNumber: currentTrack.playlistNumber,
      trackIndex: currentTrack.index,
      announceTrack: false,
      messages: [`Playlist ${playlistNumber} not found.`],
    }),
  );
});

const loadTrackRequestParser = type({
  params: {
    playlistNumber: "string",
    index: "string",
  },
});

routes.get("/track/:playlistNumber/:index", async (req, res) => {
  const request = loadTrackRequestParser(req);
  if (request instanceof type.errors) {
    res.status(400).json({
      error: request.summary,
    });
    return;
  }

  const { index, playlistNumber } = request.params;

  const track = await playlistService.getTrackPath(
    playlistNumber,
    parseInt(index),
  );

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
