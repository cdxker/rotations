import { redisClient } from "./clients.js";
import Redis from "ioredis";
import { stat } from "node:fs/promises";
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

const PLAYBACK_MODE = "playing";
const PLAYLIST_SELECTION_MODE = "selecting-playlist";

class PlaylistService {
  constructor(public readonly redisClient: Redis.Redis) {}

  public async startPlaylist(uuid: string): Promise<void> {
    await this.redisClient
      .pipeline()
      .set(this.playlistKey(uuid), DEFAULT_PLAYLIST_NUMBER)
      .set(this.trackKey(uuid), "0")
      .set(`listener:${uuid}:mode`, PLAYBACK_MODE)
      .exec();
  }

  public async startPlaylistSelection(uuid: string): Promise<void> {
    await this.redisClient.set(
      `listener:${uuid}:mode`,
      PLAYLIST_SELECTION_MODE,
    );
  }

  public async resumePlayback(uuid: string): Promise<void> {
    await this.redisClient.set(`listener:${uuid}:mode`, PLAYBACK_MODE);
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
    const playbackMode =
      (await this.redisClient.get(`listener:${uuid}:mode`)) ?? PLAYBACK_MODE;

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

    return this.commitTrack(uuid, currentState.playlist.number, nextTrackIndex);
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

      await this.redisClient.set(this.playlistKey(uuid), playlist.number);
      await this.redisClient.set(this.trackKey(uuid), index.toString());
      await this.redisClient.set(`listener:${uuid}:mode`, PLAYBACK_MODE);

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

  private playlistKey(uuid: string): string {
    return `listener:${uuid}:playlist`;
  }

  private trackKey(uuid: string): string {
    return `listener:${uuid}:track`;
  }

  private async getCurrentState(
    uuid: string,
  ): Promise<{ playlist: Playlist; index: number } | null> {
    const [storedPlaylistNumber, trackIndex] = await Promise.all([
      this.redisClient.get(this.playlistKey(uuid)),
      this.redisClient.get(this.trackKey(uuid)),
    ]);

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
