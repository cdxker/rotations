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
    songIndex: number,
  ): Promise<PlaylistTrack | null> {
    const currentTrack = await this.getCurrentTrack(uuid);

    if (!currentTrack) {
      return null;
    }

    if (currentTrack.index !== songIndex) {
      return null;
    }

    return this.toNextTrack(uuid);
  }

  public async toNextTrack(uuid: string): Promise<PlaylistTrack | null> {
    const currentTrack = await this.getCurrentTrack(uuid);
    if (!currentTrack) {
      return null;
    }
    const nextTrackIndex =
      (currentTrack.index + 1 + tracks.length) % tracks.length;

    await this.redisClient.set(`listener:${uuid}:track`, nextTrackIndex);

    return {
      filePath: tracks[nextTrackIndex],
      fileSize: (await stat(tracks[nextTrackIndex])).size,
      index: nextTrackIndex,
    };
  }

  public async toPreviousTrack(uuid: string): Promise<PlaylistTrack | null> {
    const currentTrack = await this.getCurrentTrack(uuid);
    if (!currentTrack) {
      return null;
    }
    const nextTrackIndex =
      (currentTrack.index - 1 + tracks.length) % tracks.length;

    await this.redisClient.set(`listener:${uuid}:track`, nextTrackIndex);

    return {
      filePath: tracks[nextTrackIndex],
      fileSize: (await stat(tracks[nextTrackIndex])).size,
      index: nextTrackIndex,
    };
  }
}

export const playlistService = new PlaylistService(redisClient);
