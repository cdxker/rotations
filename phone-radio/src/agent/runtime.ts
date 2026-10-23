import { voiceClient } from "../clients.js";
import { agentConfig, discordDestinationRegistry } from "../env.js";
import { playlistService } from "../playlist.service.js";
import { buildPlaylistSelectionNcco } from "../utils/buildPlaylistSelectionNcco.js";
import { buildTrackNcco } from "../utils/buildTrackNcco.js";
import { buildRequestedSongNcco } from "../utils/buildRequestedSongNcco.js";
import { AgentBridgeManager } from "./bridge-manager.js";
import { LiveSession } from "./live-session.js";
import { createPlaylistTools } from "./playlist-tools.js";

const callUrls = new Map<string, string>();
const songTransfers = new Map<string, {
  uuid: string;
  url: string;
  requestId?: string;
  restored: boolean;
  exit: boolean;
  done: Promise<void>;
}>();

export const agentBridgeManager = new AgentBridgeManager({
  createSession({ uuid, sessionId, ...callbacks }) {
    if (!agentConfig.enabled) throw new Error("AI agent is unavailable.");
    return new LiveSession({ apiKey: agentConfig.apiKey, ...callbacks,
      tools: createPlaylistTools({
        currentPlaylist: async () => (await playlistService.getCurrentTrack(uuid))?.playlistNumber ?? null,
        isActive: async () => await playlistService.getAgentSessionId(uuid) === sessionId,
        reservedPlaylistNumbers: discordDestinationRegistry.getAll().map(destination => destination.code),
        playSong: async (filePath, title, signal, position) => {
          signal.throwIfAborted();
          const url = callUrls.get(sessionId);
          if (!url) throw new Error("This voice conversation has ended.");
          let complete!: () => void;
          const handoff: { uuid: string; url: string; requestId?: string; restored: boolean; exit: boolean; done: Promise<void> } = {
            uuid, url, restored: false, exit: false, done: new Promise<void>(resolve => { complete = resolve; }),
          };
          songTransfers.set(sessionId, handoff);
          try {
            const requested = position
              ? await playlistService.beginRequestedSong(uuid, sessionId, filePath, signal, position)
              : await playlistService.beginRequestedSong(uuid, sessionId, filePath, signal);
            if (!requested) throw new Error("The song is unavailable or this conversation has ended.");
            handoff.requestId = requested.id;
            signal.throwIfAborted();
            await voiceClient.transferCallWithNCCO(uuid, buildRequestedSongNcco({
              url, uuid, requestId: requested.id, title,
            }));
          } catch {
            // A rejected transfer leaves the caller in Live. Restore its
            // ownership so the assistant can report the error and retry.
            if (handoff.requestId) {
              handoff.restored = await playlistService.restoreRequestedSongAgent(uuid, handoff.requestId, sessionId);
            }
            throw new Error("That song could not be played.");
          } finally {
            songTransfers.delete(sessionId);
            complete();
            if (handoff.requestId && !handoff.restored && !handoff.exit) releaseAgent(uuid, sessionId);
          }
        },
      }),
    });
  },
  onExit: leaveAgent,
  onFailure: failAgent,
  onClosed(_uuid, sessionId) { callUrls.delete(sessionId); },
});

export async function handleSongTransferDigit(uuid: string, digit: string | undefined): Promise<boolean> {
  for (const [sessionId, handoff] of songTransfers) {
    if (handoff.uuid !== uuid) continue;
    if (digit === "9") await leaveAgent(uuid, sessionId);
    // During handoff use the same digit behavior as the agent conversation.
    return true;
  }
  return false;
}

export function reserveAgent(uuid: string, sessionId: string, url: string): void {
  callUrls.set(sessionId, url);
  try {
    agentBridgeManager.reserve(uuid, sessionId);
  } catch (error) {
    callUrls.delete(sessionId);
    throw error;
  }
}

function releaseAgent(uuid: string, sessionId: string): void {
  callUrls.delete(sessionId);
  void agentBridgeManager.release(uuid, sessionId).catch(() => {
    console.warn("AI agent cleanup failed.");
  });
}

export async function finishAgent(uuid: string, sessionId: string): Promise<boolean> {
  const handoff = songTransfers.get(sessionId);
  if (handoff) {
    await handoff.done;
    if (handoff.exit) return false;
  }
  const changed = await playlistService.transitionFromAgent(uuid, sessionId, "playing");
  releaseAgent(uuid, sessionId);
  return changed !== null;
}

async function transferSavedTrack(uuid: string, url: string, message: string): Promise<void> {
  const track = await playlistService.getCurrentTrack(uuid);
  if (!track) throw new Error("Saved track unavailable.");
  await voiceClient.transferCallWithNCCO(uuid, buildTrackNcco({
    url, uuid, playlistNumber: track.playlistNumber, trackIndex: track.index,
    catalogRevision: track.catalogRevision,
    announceTrack: false, messages: [message],
  }));
}

async function leaveAgent(uuid: string, sessionId: string): Promise<void> {
  const handoff = songTransfers.get(sessionId);
  const url = callUrls.get(sessionId) ?? handoff?.url;
  if (!url) return;
  if (handoff) {
    // Let an in-flight song transfer settle before sending the menu. Otherwise
    // a late successful transfer could replace the menu the caller just opened.
    handoff.exit = true;
    await handoff.done;
  }
  const selectorId = handoff?.requestId && !handoff.restored
    ? await playlistService.selectRequestedSong(uuid, handoff.requestId)
    : await playlistService.transitionFromAgent(uuid, sessionId, "selecting-playlist");
  if (!selectorId) return;
  releaseAgent(uuid, sessionId);
  try {
    await voiceClient.transferCallWithNCCO(uuid, buildPlaylistSelectionNcco({ url, uuid, selectorId }));
  } catch {
    // Only recover if this selector still belongs to the failed transfer.
    if (await playlistService.claimPlaylistSelection(uuid, selectorId)) {
      await playlistService.resumePlayback(uuid);
      await transferSavedTrack(uuid, url, "The menu is unavailable. Returning to music.");
    }
  }
}

async function failAgent(uuid: string, sessionId: string, _reason: string): Promise<void> {
  const url = callUrls.get(sessionId) ?? songTransfers.get(sessionId)?.url;
  if (!(await finishAgent(uuid, sessionId)) || !url) return;
  await transferSavedTrack(uuid, url, "The AI connection ended. Returning to music.");
}
