import { redisClient } from "./clients.js";
import Redis, { type ChainableCommander } from "ioredis";
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_PLAYLIST_NUMBER,
  playlists,
  type Playlist,
} from "./playlists/index.js";

export type Track = {
  filePath: string;
  fileSize: number;
};

export type PlaylistTrack = Track & {
  index: number;
  playlistNumber: string;
  playlistName: string;
};

export type ListenerMode = "playing" | "selecting-playlist" | "discord" | "agent";

const PLAYBACK_MODE = "playing";
const PLAYLIST_SELECTION_MODE = "selecting-playlist";
const DISCORD_MODE = "discord";
const AGENT_MODE = "agent";

const RETURN_TO_PLAYBACK_IF_DISCORD_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[2])
redis.call("DEL", KEYS[2])
redis.call("DEL", KEYS[3], KEYS[4])
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
redis.call("DEL", KEYS[2], KEYS[3], KEYS[4])
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
  or redis.call("GET", KEYS[3]) ~= ARGV[3] then
  return 0
end

redis.call("SET", KEYS[1], ARGV[1])
redis.call("SET", KEYS[2], ARGV[2])
redis.call("SET", KEYS[3], ARGV[4])
redis.call("DEL", KEYS[4], KEYS[5], KEYS[6])
return 1
`;

class PlaylistService {
  constructor(public readonly redisClient: Redis.Redis) {}

  public async startPlaylist(uuid: string): Promise<void> {
    await this.executeStateTransition(
      this.redisClient
        .multi()
        .set(this.playlistKey(uuid), DEFAULT_PLAYLIST_NUMBER)
        .set(this.trackKey(uuid), "0")
        .set(`listener:${uuid}:mode`, PLAYBACK_MODE)
        .del(this.discordDestinationKey(uuid))
        .del(this.selectorKey(uuid), this.agentSessionKey(uuid)),
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
        .del(this.agentSessionKey(uuid)),
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
        .del(this.selectorKey(uuid), this.agentSessionKey(uuid)),
    );
  }

  public async beginAgent(uuid: string, sessionId: string): Promise<void> {
    await this.executeStateTransition(
      this.redisClient
        .multi()
        .set(this.modeKey(uuid), AGENT_MODE)
        .set(this.agentSessionKey(uuid), sessionId)
        .del(this.discordDestinationKey(uuid))
        .del(this.selectorKey(uuid)),
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
      4,
      this.modeKey(uuid),
      this.agentSessionKey(uuid),
      this.selectorKey(uuid),
      this.discordDestinationKey(uuid),
      AGENT_MODE,
      sessionId,
      nextMode,
      randomUUID(),
      PLAYLIST_SELECTION_MODE,
    );

    return typeof result === "string" ? result : null;
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
        .del(this.selectorKey(uuid), this.agentSessionKey(uuid)),
    );
  }

  public async getListenerMode(uuid: string): Promise<ListenerMode> {
    const storedMode = await this.redisClient.get(this.modeKey(uuid));

    if (
      storedMode === PLAYLIST_SELECTION_MODE ||
      storedMode === DISCORD_MODE ||
      storedMode === AGENT_MODE
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
      4,
      this.modeKey(uuid),
      this.discordDestinationKey(uuid),
      this.selectorKey(uuid),
      this.agentSessionKey(uuid),
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
  ): Promise<Track | null> {
    const playlist = this.getPlaylistByNumber(playlistNumber);

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
      currentState.index !== completedSongIndex
    ) {
      return null;
    }

    const nextTrackIndex =
      (completedSongIndex + 1) % currentState.playlist.tracks.length;

    const nextTrack = await this.getPlaylistTrack({
      playlist: currentState.playlist,
      index: nextTrackIndex,
    });
    if (!nextTrack) {
      return null;
    }

    // A menu/agent transition or another finished callback may win while stat
    // is pending. Recheck the complete playback state before advancing it.
    try {
      const committed = await this.redisClient.eval(
        ADVANCE_FINISHED_TRACK_SCRIPT,
        6,
        this.modeKey(uuid),
        this.playlistKey(uuid),
        this.trackKey(uuid),
        this.discordDestinationKey(uuid),
        this.selectorKey(uuid),
        this.agentSessionKey(uuid),
        PLAYBACK_MODE,
        currentState.playlist.number,
        completedSongIndex.toString(),
        nextTrackIndex.toString(),
        DEFAULT_PLAYLIST_NUMBER,
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
  ): Promise<PlaylistTrack | null> {
    const playlist = this.getPlaylistByNumber(playlistNumber);

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
          .set(this.modeKey(uuid), PLAYBACK_MODE)
          .del(this.discordDestinationKey(uuid))
          .del(this.selectorKey(uuid), this.agentSessionKey(uuid)),
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
    const nextTrackIndex =
      (currentState.index + 1 + currentState.playlist.tracks.length) %
      currentState.playlist.tracks.length;

    return this.getPlaylistTrack({
      playlist: currentState.playlist,
      index: nextTrackIndex,
    });
  }

  public async getPreviousTrack(uuid: string): Promise<PlaylistTrack | null> {
    const currentState = await this.getCurrentState(uuid);
    if (!currentState) {
      return null;
    }
    const nextTrackIndex =
      (currentState.index - 1 + currentState.playlist.tracks.length) %
      currentState.playlist.tracks.length;

    return this.getPlaylistTrack({
      playlist: currentState.playlist,
      index: nextTrackIndex,
    });
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
      ? this.commitTrack(uuid, nextTrack.playlistNumber, nextTrack.index)
      : null;
  }

  public async toPreviousTrack(uuid: string): Promise<PlaylistTrack | null> {
    const previousTrack = await this.getPreviousTrack(uuid);

    return previousTrack
      ? this.commitTrack(uuid, previousTrack.playlistNumber, previousTrack.index)
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

  private async getCurrentState(
    uuid: string,
  ): Promise<{ playlist: Playlist; index: number } | null> {
    const [storedPlaylistNumber, trackIndex] = await this.redisClient.mget(
      this.playlistKey(uuid),
      this.trackKey(uuid),
    );

    if (!trackIndex) {
      return null;
    }

    const index = Number.parseInt(trackIndex, 10);
    const playlist = this.getPlaylistByNumber(
      storedPlaylistNumber ?? DEFAULT_PLAYLIST_NUMBER,
    );

    if (!playlist || !Number.isInteger(index)) {
      return null;
    }

    if (index < 0 || index >= playlist.tracks.length) {
      return null;
    }

    return { playlist, index };
  }

  private async getPlaylistTrack({
    playlist,
    index,
  }: {
    playlist: Playlist;
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
      };
    } catch {
      return null;
    }
  }

  private getPlaylistByNumber(input: string | undefined): Playlist | null {
    const playlistNumber = this.normalizePlaylistNumber(input);

    if (!playlistNumber) {
      return null;
    }

    return (
      playlists.find((playlist) => playlist.number === playlistNumber) ?? null
    );
  }

  private normalizePlaylistNumber(input: string | undefined): string {
    return (input ?? "").replace(/\D/g, "");
  }
}

export const playlistService = new PlaylistService(redisClient);
