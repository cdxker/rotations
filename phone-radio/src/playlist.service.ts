import { redisClient } from "./clients.js";
import Redis, { type ChainableCommander } from "ioredis";
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, isAbsolute } from "node:path";
import {
  DEFAULT_PLAYLIST_NUMBER,
} from "./playlists/index.js";
import { playlistCatalog, type PlaylistRevision } from "./playlists/catalog.js";

export type Track = {
  filePath: string;
  fileSize: number;
};

export type RequestedSong = Track & { id: string };

export type RequestedSongPosition = {
  playlistNumber: string;
  trackIndex: number;
  catalogRevision: string;
};

export type PlaylistTrack = Track & {
  index: number;
  playlistNumber: string;
  playlistName: string;
  catalogRevision?: string;
};

type ListenerTrackState = {
  playlist: PlaylistRevision;
  index: number;
  storedRevision: string | null;
};

export type ListenerMode = "playing" | "selecting-playlist" | "discord" | "agent" | "requested-song";

const PLAYBACK_MODE = "playing";
const PLAYLIST_SELECTION_MODE = "selecting-playlist";
const DISCORD_MODE = "discord";
const AGENT_MODE = "agent";
const REQUESTED_SONG_MODE = "requested-song";

const BEGIN_REQUESTED_SONG_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[3])
redis.call("SET", KEYS[3], ARGV[4], "EX", 86400)
redis.call("SET", KEYS[4], ARGV[5], "EX", 86400)
if ARGV[6] ~= "" then
  redis.call("SET", KEYS[7], ARGV[6], "EX", 86400)
else
  redis.call("DEL", KEYS[7])
end
redis.call("DEL", KEYS[2], KEYS[5], KEYS[6])
return 1
`;

const FINISH_REQUESTED_SONG_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2]
  or (redis.call("GET", KEYS[4]) or "") ~= ARGV[4] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[3])
if ARGV[5] ~= "" then
  redis.call("SET", KEYS[5], ARGV[5])
  redis.call("SET", KEYS[6], ARGV[6])
  redis.call("SET", KEYS[7], ARGV[7])
end
redis.call("DEL", KEYS[2], KEYS[3], KEYS[4])
return 1
`;

const SELECT_AFTER_REQUESTED_SONG_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[3])
redis.call("SET", KEYS[4], ARGV[4])
redis.call("DEL", KEYS[2], KEYS[3], KEYS[5])
return 1
`;

const RESTORE_REQUESTED_SONG_AGENT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[3])
redis.call("SET", KEYS[4], ARGV[4])
redis.call("DEL", KEYS[2], KEYS[3], KEYS[5])
return 1
`;

const RETURN_TO_PLAYBACK_IF_DISCORD_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[2])
redis.call("DEL", KEYS[2])
redis.call("DEL", KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7])
return 1
`;

const CLAIM_PLAYLIST_SELECTION_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2] then
  return 0
end

redis.call("DEL", KEYS[2])
return 1
`;

const TRANSITION_FROM_AGENT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2] then
  return false
end

redis.call("SET", KEYS[1], ARGV[3])
redis.call("DEL", KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7])
if ARGV[3] == ARGV[5] then
  redis.call("SET", KEYS[3], ARGV[4])
  return ARGV[4]
end
return ARGV[2]
`;

const ADVANCE_FINISHED_TRACK_SCRIPT = `
local mode = redis.call("GET", KEYS[1])
if (mode and mode ~= ARGV[1])
  or (redis.call("GET", KEYS[2]) or ARGV[5]) ~= ARGV[2]
  or redis.call("GET", KEYS[3]) ~= ARGV[3]
  or (redis.call("GET", KEYS[7]) or "") ~= ARGV[6] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[1])
redis.call("SET", KEYS[2], ARGV[2])
redis.call("SET", KEYS[3], ARGV[4])
redis.call("SET", KEYS[7], ARGV[7])
redis.call("DEL", KEYS[4], KEYS[5], KEYS[6], KEYS[8], KEYS[9], KEYS[10])
return 1
`;

class PlaylistService {
  constructor(public readonly redisClient: Redis.Redis) {}

  public async startPlaylist(uuid: string): Promise<void> {
    const playlist = playlistCatalog.current(DEFAULT_PLAYLIST_NUMBER);
    if (!playlist) throw new Error("Default playlist is unavailable.");
    await this.executeStateTransition(
      this.redisClient
        .multi()
        .set(this.playlistKey(uuid), DEFAULT_PLAYLIST_NUMBER)
        .set(this.trackKey(uuid), "0")
        .set(this.revisionKey(uuid), playlist.revision)
        .set(`listener:${uuid}:mode`, PLAYBACK_MODE)
        .del(this.discordDestinationKey(uuid))
        .del(this.selectorKey(uuid), this.agentSessionKey(uuid))
        .del(this.requestedSongKey(uuid), this.requestedSongPathKey(uuid), this.requestedSongContinuationKey(uuid)),
    );
  }

  public async startPlaylistSelection(uuid: string): Promise<string> {
    const selectorId = randomUUID();
    await this.executeStateTransition(
      this.redisClient
        .multi()
        .set(this.modeKey(uuid), PLAYLIST_SELECTION_MODE)
        .set(this.selectorKey(uuid), selectorId)
        .del(this.discordDestinationKey(uuid))
        .del(this.agentSessionKey(uuid))
        .del(this.requestedSongKey(uuid), this.requestedSongPathKey(uuid), this.requestedSongContinuationKey(uuid)),
    );

    return selectorId;
  }

  public async claimPlaylistSelection(
    uuid: string,
    selectorId: string,
  ): Promise<boolean> {
    if (!selectorId) {
      return false;
    }

    const result = await this.redisClient.eval(
      CLAIM_PLAYLIST_SELECTION_SCRIPT,
      2,
      this.modeKey(uuid),
      this.selectorKey(uuid),
      PLAYLIST_SELECTION_MODE,
      selectorId,
    );

    return result === 1;
  }

  public async resumePlayback(uuid: string): Promise<void> {
    await this.executeStateTransition(
      this.redisClient
        .multi()
        .set(this.modeKey(uuid), PLAYBACK_MODE)
        .del(this.discordDestinationKey(uuid))
        .del(this.selectorKey(uuid), this.agentSessionKey(uuid))
        .del(this.requestedSongKey(uuid), this.requestedSongPathKey(uuid), this.requestedSongContinuationKey(uuid)),
    );
  }

  public async beginAgent(uuid: string, sessionId: string): Promise<void> {
    await this.executeStateTransition(
      this.redisClient
        .multi()
        .set(this.modeKey(uuid), AGENT_MODE)
        .set(this.agentSessionKey(uuid), sessionId)
        .del(this.discordDestinationKey(uuid))
        .del(this.selectorKey(uuid))
        .del(this.requestedSongKey(uuid), this.requestedSongPathKey(uuid), this.requestedSongContinuationKey(uuid)),
    );
  }

  public async getAgentSessionId(uuid: string): Promise<string | null> {
    return this.redisClient.get(this.agentSessionKey(uuid));
  }

  public async transitionFromAgent(
    uuid: string,
    sessionId: string,
    nextMode: "playing" | "selecting-playlist",
  ): Promise<string | null> {
    const result = await this.redisClient.eval(
      TRANSITION_FROM_AGENT_SCRIPT,
      7,
      this.modeKey(uuid),
      this.agentSessionKey(uuid),
      this.selectorKey(uuid),
      this.discordDestinationKey(uuid),
      this.requestedSongKey(uuid),
      this.requestedSongPathKey(uuid),
      this.requestedSongContinuationKey(uuid),
      AGENT_MODE,
      sessionId,
      nextMode,
      randomUUID(),
      PLAYLIST_SELECTION_MODE,
    );

    return typeof result === "string" ? result : null;
  }

  public async beginRequestedSong(
    uuid: string,
    sessionId: string,
    filePath: string,
    signal?: AbortSignal,
    position?: RequestedSongPosition,
  ): Promise<RequestedSong | null> {
    const track = await this.getRequestedSongFile(filePath);
    signal?.throwIfAborted();
    if (!track || !sessionId) return null;

    let continuation = "";
    if (position) {
      const playlist = this.getPlaylistByNumber(
        position.playlistNumber,
        position.catalogRevision,
      );
      if (
        !playlist ||
        playlist.tracks[position.trackIndex] !== track.filePath ||
        !playlist.songIds[position.trackIndex]
      ) {
        return null;
      }
      continuation = JSON.stringify(position);
    }

    const id = randomUUID();
    const changed = await this.redisClient.eval(
      BEGIN_REQUESTED_SONG_SCRIPT,
      7,
      this.modeKey(uuid),
      this.agentSessionKey(uuid),
      this.requestedSongKey(uuid),
      this.requestedSongPathKey(uuid),
      this.selectorKey(uuid),
      this.discordDestinationKey(uuid),
      this.requestedSongContinuationKey(uuid),
      AGENT_MODE,
      sessionId,
      REQUESTED_SONG_MODE,
      id,
      track.filePath,
      continuation,
    );
    return changed === 1 ? { ...track, id } : null;
  }

  public async getRequestedSong(uuid: string, id: string): Promise<Track | null> {
    if (!id) return null;
    const [mode, currentId, filePath] = await this.redisClient.mget(
      this.modeKey(uuid),
      this.requestedSongKey(uuid),
      this.requestedSongPathKey(uuid),
    );
    if (mode !== REQUESTED_SONG_MODE || currentId !== id || !filePath) return null;

    const track = await this.getRequestedSongFile(filePath);
    if (!track) return null;
    const [latestMode, latestId] = await this.redisClient.mget(
      this.modeKey(uuid), this.requestedSongKey(uuid),
    );
    return latestMode === REQUESTED_SONG_MODE && latestId === id ? track : null;
  }

  public async finishRequestedSong(uuid: string, id: string): Promise<PlaylistTrack | null> {
    if (!id) return null;
    const continuation = await this.redisClient.get(
      this.requestedSongContinuationKey(uuid),
    ) ?? "";
    let nextTrack: PlaylistTrack | null = null;
    if (continuation) {
      try {
        const position = JSON.parse(continuation) as RequestedSongPosition;
        const playlist = this.getPlaylistByNumber(
          position.playlistNumber,
          position.catalogRevision,
        );
        if (playlist && Number.isInteger(position.trackIndex)) {
          nextTrack = await this.getAdjacentTrack(
            { playlist, index: position.trackIndex, storedRevision: playlist.revision },
            1,
          );
        }
      } catch {
        nextTrack = null;
      }
    }
    const changed = await this.redisClient.eval(
      FINISH_REQUESTED_SONG_SCRIPT,
      7,
      this.modeKey(uuid),
      this.requestedSongKey(uuid),
      this.requestedSongPathKey(uuid),
      this.requestedSongContinuationKey(uuid),
      this.playlistKey(uuid),
      this.trackKey(uuid),
      this.revisionKey(uuid),
      REQUESTED_SONG_MODE,
      id,
      PLAYBACK_MODE,
      continuation,
      nextTrack?.playlistNumber ?? "",
      nextTrack?.index.toString() ?? "",
      nextTrack?.catalogRevision ?? "",
    );
    return changed === 1 ? nextTrack ?? this.getCurrentTrack(uuid) : null;
  }

  public async selectRequestedSong(uuid: string, id: string): Promise<string | null> {
    if (!id) return null;
    const selectorId = randomUUID();
    const changed = await this.redisClient.eval(
      SELECT_AFTER_REQUESTED_SONG_SCRIPT,
      5,
      this.modeKey(uuid),
      this.requestedSongKey(uuid),
      this.requestedSongPathKey(uuid),
      this.selectorKey(uuid),
      this.requestedSongContinuationKey(uuid),
      REQUESTED_SONG_MODE,
      id,
      PLAYLIST_SELECTION_MODE,
      selectorId,
    );
    return changed === 1 ? selectorId : null;
  }

  public async restoreRequestedSongAgent(
    uuid: string,
    id: string,
    sessionId: string,
  ): Promise<boolean> {
    if (!id || !sessionId) return false;
    const changed = await this.redisClient.eval(
      RESTORE_REQUESTED_SONG_AGENT_SCRIPT,
      5,
      this.modeKey(uuid),
      this.requestedSongKey(uuid),
      this.requestedSongPathKey(uuid),
      this.agentSessionKey(uuid),
      this.requestedSongContinuationKey(uuid),
      REQUESTED_SONG_MODE,
      id,
      AGENT_MODE,
      sessionId,
    );
    return changed === 1;
  }

  public async beginDiscordBridge(
    uuid: string,
    destinationCode: string,
  ): Promise<void> {
    await this.executeStateTransition(
      this.redisClient
        .multi()
        .set(this.discordDestinationKey(uuid), destinationCode)
        .set(this.modeKey(uuid), DISCORD_MODE)
        .del(this.selectorKey(uuid), this.agentSessionKey(uuid))
        .del(this.requestedSongKey(uuid), this.requestedSongPathKey(uuid), this.requestedSongContinuationKey(uuid)),
    );
  }

  public async getListenerMode(uuid: string): Promise<ListenerMode> {
    const storedMode = await this.redisClient.get(this.modeKey(uuid));

    if (
      storedMode === PLAYLIST_SELECTION_MODE ||
      storedMode === DISCORD_MODE ||
      storedMode === AGENT_MODE ||
      storedMode === REQUESTED_SONG_MODE
    ) {
      return storedMode;
    }

    return PLAYBACK_MODE;
  }

  public async getDiscordDestinationCode(
    uuid: string,
  ): Promise<string | null> {
    return this.redisClient.get(this.discordDestinationKey(uuid));
  }

  public async returnToPlaybackIfDiscord(uuid: string): Promise<boolean> {
    const result = await this.redisClient.eval(
      RETURN_TO_PLAYBACK_IF_DISCORD_SCRIPT,
      7,
      this.modeKey(uuid),
      this.discordDestinationKey(uuid),
      this.selectorKey(uuid),
      this.agentSessionKey(uuid),
      this.requestedSongKey(uuid),
      this.requestedSongPathKey(uuid),
      this.requestedSongContinuationKey(uuid),
      DISCORD_MODE,
      PLAYBACK_MODE,
    );

    return result === 1;
  }

  public async getCurrentTrack(uuid: string): Promise<PlaylistTrack | null> {
    try {
      const currentState = await this.getCurrentState(uuid);

      return currentState ? this.getPlaylistTrack(currentState) : null;
    } catch (error) {
      return null;
    }
  }

  public async getTrackPath(
    playlistNumber: string,
    songIndex: number,
    catalogRevision?: string,
  ): Promise<Track | null> {
    const playlist = this.getPlaylistByNumber(playlistNumber, catalogRevision);

    if (!playlist) {
      return null;
    }

    const filePath = playlist.tracks[songIndex];

    if (!filePath) {
      return null;
    }

    try {
      const trackStat = await stat(filePath);

      return {
        filePath,
        fileSize: trackStat.size,
      };
    } catch (error) {
      return null;
    }
  }

  public async trackFinished(
    uuid: string,
    completedPlaylistNumber: string,
    completedSongIndex: number,
    completedRevision?: string,
  ): Promise<PlaylistTrack | null> {
    const playbackMode = await this.getListenerMode(uuid);

    if (playbackMode !== PLAYBACK_MODE) {
      return null;
    }

    const currentState = await this.getCurrentState(uuid);

    if (!currentState) {
      return null;
    }

    if (
      currentState.playlist.number !== completedPlaylistNumber ||
      currentState.index !== completedSongIndex ||
      (completedRevision !== undefined
        ? currentState.playlist.revision !== completedRevision
        : currentState.storedRevision !== null)
    ) {
      return null;
    }

    const nextTrack = await this.getAdjacentTrack(currentState, 1);
    if (!nextTrack) {
      return null;
    }

    // A menu/agent transition or another finished callback may win while stat
    // is pending. Recheck the complete playback state before advancing it.
    try {
      const committed = await this.redisClient.eval(
        ADVANCE_FINISHED_TRACK_SCRIPT,
        10,
        this.modeKey(uuid),
        this.playlistKey(uuid),
        this.trackKey(uuid),
        this.discordDestinationKey(uuid),
        this.selectorKey(uuid),
        this.agentSessionKey(uuid),
        this.revisionKey(uuid),
        this.requestedSongKey(uuid),
        this.requestedSongPathKey(uuid),
        this.requestedSongContinuationKey(uuid),
        PLAYBACK_MODE,
        currentState.playlist.number,
        completedSongIndex.toString(),
        nextTrack.index.toString(),
        DEFAULT_PLAYLIST_NUMBER,
        currentState.storedRevision ?? "",
        nextTrack.catalogRevision!,
      );
      return committed === 1 ? nextTrack : null;
    } catch {
      return null;
    }
  }

  public async commitTrack(
    uuid: string,
    playlistNumber: string,
    index: number,
    catalogRevision?: string,
  ): Promise<PlaylistTrack | null> {
    const playlist = this.getPlaylistByNumber(playlistNumber, catalogRevision);

    if (!playlist) {
      return null;
    }

    try {
      const playlistTrack = await this.getPlaylistTrack({ playlist, index });

      if (!playlistTrack) {
        return null;
      }

      await this.executeStateTransition(
        this.redisClient
          .multi()
          .set(this.playlistKey(uuid), playlist.number)
          .set(this.trackKey(uuid), index.toString())
          .set(this.revisionKey(uuid), playlist.revision)
          .set(this.modeKey(uuid), PLAYBACK_MODE)
          .del(this.discordDestinationKey(uuid))
          .del(this.selectorKey(uuid), this.agentSessionKey(uuid))
          .del(this.requestedSongKey(uuid), this.requestedSongPathKey(uuid), this.requestedSongContinuationKey(uuid)),
      );

      return playlistTrack;
    } catch {
      return null;
    }
  }

  public async getNextTrack(uuid: string): Promise<PlaylistTrack | null> {
    const currentState = await this.getCurrentState(uuid);
    if (!currentState) {
      return null;
    }
    return this.getAdjacentTrack(currentState, 1);
  }

  public async getPreviousTrack(uuid: string): Promise<PlaylistTrack | null> {
    const currentState = await this.getCurrentState(uuid);
    if (!currentState) {
      return null;
    }
    return this.getAdjacentTrack(currentState, -1);
  }

  public async switchPlaylistByNumber(
    uuid: string,
    playlistNumber: string | undefined,
  ): Promise<PlaylistTrack | null> {
    const playlist = this.getPlaylistByNumber(playlistNumber);

    if (!playlist) {
      return null;
    }

    return this.commitTrack(uuid, playlist.number, 0);
  }

  /**
   * Convenience wrappers for non-transfer callers. Digit routes should preview
   * with getNextTrack/getPreviousTrack, transfer, then commit the track.
   */
  public async toNextTrack(uuid: string): Promise<PlaylistTrack | null> {
    const nextTrack = await this.getNextTrack(uuid);

    return nextTrack
      ? this.commitTrack(uuid, nextTrack.playlistNumber, nextTrack.index, nextTrack.catalogRevision)
      : null;
  }

  public async toPreviousTrack(uuid: string): Promise<PlaylistTrack | null> {
    const previousTrack = await this.getPreviousTrack(uuid);

    return previousTrack
      ? this.commitTrack(uuid, previousTrack.playlistNumber, previousTrack.index, previousTrack.catalogRevision)
      : null;
  }

  private async executeStateTransition(transaction: ChainableCommander): Promise<void> {
    const results = await transaction.exec();
    if (!results) {
      throw new Error("Listener state transaction was aborted.");
    }
    for (const [error] of results) {
      if (error) throw error;
    }
  }

  private playlistKey(uuid: string): string {
    return `listener:${uuid}:playlist`;
  }

  private trackKey(uuid: string): string {
    return `listener:${uuid}:track`;
  }

  private revisionKey(uuid: string): string {
    return `listener:${uuid}:catalog-revision`;
  }

  private modeKey(uuid: string): string {
    return `listener:${uuid}:mode`;
  }

  private discordDestinationKey(uuid: string): string {
    return `listener:${uuid}:discord-destination`;
  }

  private selectorKey(uuid: string): string {
    return `listener:${uuid}:selector-id`;
  }

  private agentSessionKey(uuid: string): string {
    return `listener:${uuid}:agent-session-id`;
  }

  private requestedSongKey(uuid: string): string {
    return `listener:${uuid}:requested-song-id`;
  }

  private requestedSongPathKey(uuid: string): string {
    return `listener:${uuid}:requested-song-path`;
  }

  private requestedSongContinuationKey(uuid: string): string {
    return `listener:${uuid}:requested-song-continuation`;
  }

  private async getRequestedSongFile(filePath: string): Promise<Track | null> {
    if (!isAbsolute(filePath) || extname(filePath).toLowerCase() !== ".mp3") return null;
    try {
      const file = await stat(filePath);
      return file.isFile() && file.size > 0 ? { filePath, fileSize: file.size } : null;
    } catch {
      return null;
    }
  }

  private async getCurrentState(
    uuid: string,
  ): Promise<ListenerTrackState | null> {
    const [storedPlaylistNumber, trackIndex, storedRevision] = await this.redisClient.mget(
      this.playlistKey(uuid),
      this.trackKey(uuid),
      this.revisionKey(uuid),
    );

    if (!trackIndex) {
      return null;
    }

    const index = Number.parseInt(trackIndex, 10);
    const playlist = this.getPlaylistByNumber(
      storedPlaylistNumber ?? DEFAULT_PLAYLIST_NUMBER,
      storedRevision ?? undefined,
    );

    if (!playlist || !Number.isInteger(index)) {
      return null;
    }

    if (index < 0 || index >= playlist.tracks.length) {
      return null;
    }

    return { playlist, index, storedRevision: storedRevision ?? null };
  }

  private async getAdjacentTrack(
    state: ListenerTrackState,
    direction: 1 | -1,
  ): Promise<PlaylistTrack | null> {
    const latest = playlistCatalog.current(state.playlist.number);
    if (!latest?.tracks.length) return null;

    const currentSongId = state.playlist.songIds[state.index];
    const currentIndex = latest.songIds.indexOf(currentSongId);
    if (currentIndex !== -1) {
      return this.getPlaylistTrack({
        playlist: latest,
        index: (currentIndex + direction + latest.tracks.length) % latest.tracks.length,
      });
    }

    // Let a removed song finish, then continue with its first surviving neighbor.
    // Every caller keeps their own immutable queued revision during live edits.
    for (let offset = 1; offset < state.playlist.tracks.length; offset++) {
      const oldIndex = (state.index + direction * offset + state.playlist.tracks.length) %
        state.playlist.tracks.length;
      const successorIndex = latest.songIds.indexOf(state.playlist.songIds[oldIndex]);
      if (successorIndex !== -1) {
        return this.getPlaylistTrack({ playlist: latest, index: successorIndex });
      }
    }
    return this.getPlaylistTrack({
      playlist: latest,
      index: direction === 1 ? 0 : latest.tracks.length - 1,
    });
  }

  private async getPlaylistTrack({
    playlist,
    index,
  }: {
    playlist: PlaylistRevision;
    index: number;
  }): Promise<PlaylistTrack | null> {
    const filePath = playlist.tracks[index];

    if (!filePath) {
      return null;
    }

    try {
      const fileSize = (await stat(filePath)).size;

      return {
        filePath,
        fileSize,
        index,
        playlistNumber: playlist.number,
        playlistName: playlist.name,
        catalogRevision: playlist.revision,
      };
    } catch {
      return null;
    }
  }

  private getPlaylistByNumber(
    input: string | undefined,
    catalogRevision?: string,
  ): PlaylistRevision | null {
    const playlistNumber = this.normalizePlaylistNumber(input);

    if (!playlistNumber) {
      return null;
    }

    return catalogRevision === undefined
      ? playlistCatalog.current(playlistNumber)
      : playlistCatalog.revision(playlistNumber, catalogRevision);
  }

  private normalizePlaylistNumber(input: string | undefined): string {
    return (input ?? "").replace(/\D/g, "");
  }
}

export const playlistService = new PlaylistService(redisClient);
