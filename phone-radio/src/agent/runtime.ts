import { voiceClient } from "../clients.js";
import { agentConfig } from "../env.js";
import { playlistService } from "../playlist.service.js";
import { buildPlaylistSelectionNcco } from "../utils/buildPlaylistSelectionNcco.js";
import { buildTrackNcco } from "../utils/buildTrackNcco.js";
import { AgentBridgeManager } from "./bridge-manager.js";
import { LiveSession } from "./live-session.js";

const callUrls = new Map<string, string>();

export const agentBridgeManager = new AgentBridgeManager({
  createSession(callbacks) {
    if (!agentConfig.enabled) throw new Error("AI agent is unavailable.");
    return new LiveSession({ apiKey: agentConfig.apiKey, ...callbacks });
  },
  onExit: leaveAgent,
  onFailure: failAgent,
  onClosed(_uuid, sessionId) { callUrls.delete(sessionId); },
});

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
  const changed = await playlistService.transitionFromAgent(uuid, sessionId, "playing");
  releaseAgent(uuid, sessionId);
  return changed !== null;
}

async function transferSavedTrack(uuid: string, url: string, message: string): Promise<void> {
  const track = await playlistService.getCurrentTrack(uuid);
  if (!track) throw new Error("Saved track unavailable.");
  await voiceClient.transferCallWithNCCO(uuid, buildTrackNcco({
    url, uuid, playlistNumber: track.playlistNumber, trackIndex: track.index,
    announceTrack: false, messages: [message],
  }));
}

async function leaveAgent(uuid: string, sessionId: string): Promise<void> {
  const url = callUrls.get(sessionId);
  if (!url) return;
  const selectorId = await playlistService.transitionFromAgent(uuid, sessionId, "selecting-playlist");
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
  const url = callUrls.get(sessionId);
  if (!(await finishAgent(uuid, sessionId)) || !url) return;
  await transferSavedTrack(uuid, url, "The AI connection ended. Returning to music.");
}
