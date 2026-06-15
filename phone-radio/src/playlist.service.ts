import { redisClient } from "./clients.js";
import Redis from "ioredis";
import { tracks } from "./tracks.js";
import { stat } from "node:fs/promises";

export type Track = {
  filePath: string;
  fileSize: number;
};

export type PlaylistTrack = Track & {
  index: number;
};

class PlaylistService {
  constructor(public readonly redisClient: Redis.Redis) {}

  public async startPlaylist(uuid: string): Promise<void> {
    await this.redisClient.set(`listener:${uuid}:track`, "0");
  }

  public async getCurrentTrack(uuid: string): Promise<PlaylistTrack | null> {
    try {
      let trackIndex = await this.redisClient.get(`listener:${uuid}:track`);

      if (!trackIndex) return null;

      const index = parseInt(trackIndex);

      return {
        filePath: tracks[index],
        fileSize: (await stat(tracks[index])).size,
        index,
      };
    } catch (error) {
      return null;
    }
  }

  public async getTrackPath(songIndex: number): Promise<Track | null> {
    const filePath = tracks[songIndex];
    try {
      const trackStat = await stat(filePath);

      return {
        filePath: tracks[songIndex],
        fileSize: trackStat.size,
      };
    } catch (error) {
      return null;
    }
  }

  public async trackFinished(
    uuid: string,
    completedSongIndex: number,
  ): Promise<PlaylistTrack | null> {
    const currentTrack = await this.getCurrentTrack(uuid);

    if (!currentTrack) {
      return null;
    }

    if (currentTrack.index !== completedSongIndex) {
      return null;
    }

    const nextTrackIndex = (completedSongIndex + 1) % tracks.length;

    return this.setToTrack(uuid, nextTrackIndex);
  }

  private async setToTrack(
    uuid: string,
    index: number,
  ): Promise<PlaylistTrack | null> {
    const filePath = tracks[index];

    try {
      const fileSize = (await stat(filePath)).size;

      await this.redisClient.set(`listener:${uuid}:track`, index);

      return {
        filePath,
        fileSize,
        index,
      };
    } catch {
      return null;
    }
  }

  public async toNextTrack(uuid: string): Promise<PlaylistTrack | null> {
    const currentTrack = await this.getCurrentTrack(uuid);
    if (!currentTrack) {
      return null;
    }
    const nextTrackIndex =
      (currentTrack.index + 1 + tracks.length) % tracks.length;

    return this.setToTrack(uuid, nextTrackIndex);
  }

  public async toPreviousTrack(uuid: string): Promise<PlaylistTrack | null> {
    const currentTrack = await this.getCurrentTrack(uuid);
    if (!currentTrack) {
      return null;
    }
    const nextTrackIndex =
      (currentTrack.index - 1 + tracks.length) % tracks.length;

    return this.setToTrack(uuid, nextTrackIndex);
  }
}

export const playlistService = new PlaylistService(redisClient);
