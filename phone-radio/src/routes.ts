import { randomUUID } from "node:crypto";
import { type } from "arktype";
import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import {
  discordBridgeManager,
  discordRuntime,
  voiceClient,
} from "./clients.js";
import { agentConfig, discordBridgeConfig, discordDestinationRegistry } from "./env.js";
import { finishAgent, reserveAgent } from "./agent/runtime.js";
import { buildAgentNcco } from "./utils/buildAgentNcco.js";
import { playlistService, type PlaylistTrack } from "./playlist.service.js";
import { buildPlaylistSelectionNcco } from "./utils/buildPlaylistSelectionNcco.js";
import { buildTrackNcco } from "./utils/buildTrackNcco.js";
import { buildDiscordBridgeNcco } from "./utils/buildDiscordBridgeNcco.js";

export const routes: ExpressRouter = Router();
const playlistSelectorTransfers = new Set<string>();

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

    void voiceClient.subscribeDTMF(uuid, digitPressUrl.toString()).catch(() => {
      req.log.warn({ uuid }, "Failed to subscribe to DTMF input");
    });
  }, 1_000);

  setTimeout(() => {
    void voiceClient.playDTMF(uuid, "1").catch(() => {
      req.log.warn({ uuid }, "Failed to play initial DTMF signal");
    });
  }, 5_000);

  res.json(
    buildTrackNcco({
      url,
      uuid,
      playlistNumber: currentTrack.playlistNumber,
      trackIndex: currentTrack.index,
      catalogRevision: currentTrack.catalogRevision,
      announceTrack: false,
    }),
  );
});

const finishedTrackRequestParser = type({
  query: { "catalogRevision?": "string" },
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
      request.query.catalogRevision,
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
        catalogRevision: nextTrack.catalogRevision,
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

  const mode = await playlistService.getListenerMode(uuid);
  if (mode === "selecting-playlist" || mode === "agent") {
    res.status(204).send();
    return;
  }

  if (mode === "discord") {
    if (digit === "9") {
      if (playlistSelectorTransfers.has(uuid)) {
        res.status(204).send();
        return;
      }
      playlistSelectorTransfers.add(uuid);
      try {
        const selectorId = await playlistService.startPlaylistSelection(uuid);
        await discordBridgeManager.detach(uuid);
        await voiceClient.transferCallWithNCCO(
          uuid,
          buildPlaylistSelectionNcco({ url, uuid, selectorId }),
        );
      } finally {
        playlistSelectorTransfers.delete(uuid);
      }
    }
    // Music navigation is deliberately inert while phone media is bridged.
    res.status(204).send();
    return;
  }

  let nextTrack: PlaylistTrack | null = null;

  if (digit !== "1" && digit !== "2" && digit !== "9") {
    res.status(400).json({
      error: "Invalid digit.",
    });
    return;
  }

  if (digit === "9") {
    if (playlistSelectorTransfers.has(uuid)) {
      res.status(204).send();
      return;
    }
    playlistSelectorTransfers.add(uuid);
    try {
      const selectorId = await playlistService.startPlaylistSelection(uuid);
      await voiceClient.transferCallWithNCCO(
        uuid,
        buildPlaylistSelectionNcco({ url, uuid, selectorId }),
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
    } finally {
      playlistSelectorTransfers.delete(uuid);
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
        catalogRevision: nextTrack.catalogRevision,
        announceTrack: true,
      }),
    );

    const committedTrack = await playlistService.commitTrack(
      uuid,
      nextTrack.playlistNumber,
      nextTrack.index,
      nextTrack.catalogRevision,
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
    "selectorId?": "string",
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

  const selectorId = request.query.selectorId;
  if (!selectorId || !(await playlistService.claimPlaylistSelection(uuid, selectorId))) {
    res.status(204).send();
    return;
  }

  const playlistNumber = request.body.digits ?? request.body.dtmf?.digits;
  if (playlistNumber === "99") {
    if (!agentConfig.enabled) {
      await playlistService.resumePlayback(uuid);
      await returnToCurrentTrack(res, uuid, url, "The AI agent is unavailable. Returning to music.");
      return;
    }
    const sessionId = randomUUID();
    try {
      await playlistService.beginAgent(uuid, sessionId);
      reserveAgent(uuid, sessionId, url);
      res.json(buildAgentNcco({ url, uuid, sessionId, websocketSecret: agentConfig.websocketSecret }));
    } catch {
      await finishAgent(uuid, sessionId);
      await returnToCurrentTrack(res, uuid, url, "The AI agent is unavailable. Returning to music.");
    }
    return;
  }
  const destination = discordDestinationRegistry.getByCode(playlistNumber);

  if (destination) {
    if (!discordBridgeConfig.enabled || !discordRuntime.isDestinationAvailable(destination.code)) {
      await playlistService.resumePlayback(uuid);
      await returnToCurrentTrack(res, uuid, url, `Discord ${destination.name} is unavailable.`);
      return;
    }

    try {
      const memberCount = await discordRuntime.getDestinationMemberCount(
        destination,
      );
      await playlistService.beginDiscordBridge(uuid, destination.code);
      discordBridgeManager.reserve(uuid, destination);
      res.json(
        buildDiscordBridgeNcco({
          destinationName: destination.name,
          memberCount,
          url,
          uuid,
          websocketSecret: discordBridgeConfig.websocketSecret,
        }),
      );
    } catch (error: unknown) {
      discordBridgeManager.cancelReservation(uuid);
      await playlistService.returnToPlaybackIfDiscord(uuid);
      req.log.error({ error, uuid }, "Failed to reserve Discord bridge");
      await returnToCurrentTrack(res, uuid, url, "Discord connection failed. Returning to music.");
    }
    return;
  }
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
        catalogRevision: selectedTrack.catalogRevision,
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
      catalogRevision: currentTrack.catalogRevision,
      announceTrack: false,
      messages: [playlistNumber ? `Playlist ${playlistNumber} not found.` : "Returning to music."],
    }),
  );
});

const agentEventRequestParser = type({
  query: { uuid: "string", sessionId: "string" },
  body: { "status?": "string" },
  locals: { baseUrl: "string" },
});

routes.post("/agent/event", async (req, res) => {
  const request = agentEventRequestParser(req);
  if (request instanceof type.errors) {
    res.status(400).json({ error: request.summary });
    return;
  }
  const status = request.body.status?.toLowerCase();
  const terminal = ["failed", "unanswered", "disconnected", "timeout", "cancelled", "completed"];
  if (!status || !terminal.includes(status)) {
    res.json([]);
    return;
  }
  const { uuid, sessionId } = request.query;
  const changed = await finishAgent(uuid, sessionId);
  if (!changed || status === "completed" || status === "cancelled") {
    res.json([]);
    return;
  }
  await returnToCurrentTrack(res, uuid, request.locals.baseUrl,
    "The AI connection ended. Returning to music.");
});

const discordEventRequestParser = type({
  query: { uuid: "string" },
  body: { "status?": "string" },
  locals: { baseUrl: "string" },
});

routes.post("/discord/event", async (req, res) => {
  const request = discordEventRequestParser(req);
  if (request instanceof type.errors) {
    res.status(400).json({ error: request.summary });
    return;
  }
  const { uuid } = request.query;
  const status = request.body.status?.toLowerCase();
  const failedStatuses = new Set(["failed", "unanswered", "disconnected", "timeout"]);
  if (!status || !failedStatuses.has(status)) {
    res.json([]);
    return;
  }
  req.log.warn(
    { status, uuid },
    "Discord bridge transport ended; returning call to music",
  );
  discordBridgeManager.cancelReservation(uuid);
  await discordBridgeManager.detach(uuid);
  if (!(await playlistService.returnToPlaybackIfDiscord(uuid))) {
    res.json([]);
    return;
  }
  await returnToCurrentTrack(
    res,
    uuid,
    request.locals.baseUrl,
    "Discord connection ended. Returning to music.",
  );
});

async function returnToCurrentTrack(
  res: { json(payload: unknown): unknown; status(statusCode: number): { json(payload: unknown): unknown } },
  uuid: string,
  url: string,
  message: string,
): Promise<void> {
  const currentTrack = await playlistService.getCurrentTrack(uuid);
  if (!currentTrack) {
    res.status(404).json({ error: "Current track could not be found." });
    return;
  }
  res.json(
    buildTrackNcco({
      url,
      uuid,
      playlistNumber: currentTrack.playlistNumber,
      trackIndex: currentTrack.index,
      catalogRevision: currentTrack.catalogRevision,
      announceTrack: false,
      messages: [message],
    }),
  );
}

const loadTrackRequestParser = type({
  query: { "catalogRevision?": "string" },
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
    request.query.catalogRevision,
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
