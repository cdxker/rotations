import type { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const voice = vi.hoisted(() => {
  class MockEmitter {
    readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    removeAllListeners(): void {
      this.listeners.clear();
    }
  }

  const player = Object.assign(new MockEmitter(), {
    play: vi.fn(),
    stop: vi.fn(),
  });
  const speaking = new MockEmitter();
  const connection = {
    destroy: vi.fn(),
    receiver: { speaking },
    subscribe: vi.fn(),
  };
  return {
    connection,
    createAudioResource: vi.fn((stream: PassThrough) => {
      stream.on("close", vi.fn());
      stream.on("end", vi.fn());
      stream.on("error", vi.fn());
      stream.on("finish", vi.fn());
      return { stream };
    }),
    entersState: vi.fn(async () => connection),
    joinVoiceChannel: vi.fn(() => connection),
    player,
    speaking,
  };
});

vi.mock("@discordjs/voice", () => ({
  AudioPlayerStatus: { Idle: "idle" },
  EndBehaviorType: { AfterSilence: "after-silence" },
  StreamType: { Raw: "raw" },
  VoiceConnectionStatus: { Ready: "ready" },
  createAudioPlayer: () => voice.player,
  createAudioResource: voice.createAudioResource,
  entersState: voice.entersState,
  joinVoiceChannel: voice.joinVoiceChannel,
}));

vi.mock("prism-media", () => ({
  default: { opus: { Decoder: class {} } },
}));

import { DiscordVoiceSession } from "../src/discord/discord-voice-session.js";

const destination = {
  channelId: "channel-a",
  code: "80",
  guildId: "guild-a",
  name: "Radio friends",
} as const;

describe("DiscordVoiceSession", () => {
  beforeEach(() => {
    voice.createAudioResource.mockClear();
    voice.connection.destroy.mockClear();
    voice.connection.subscribe.mockClear();
    voice.entersState.mockClear();
    voice.joinVoiceChannel.mockClear();
    voice.player.play.mockClear();
    voice.player.stop.mockClear();
    voice.player.removeAllListeners();
    voice.speaking.removeAllListeners();
  });

  it("rotates the output stream instead of accumulating listeners during idle recovery", async () => {
    const client = {
      channels: {
        fetch: vi.fn(async () => ({
          guild: { id: "guild-a", voiceAdapterCreator: {} },
          id: "channel-a",
          isVoiceBased: () => true,
        })),
      },
      user: { id: "bot-user" },
    };
    const session = await DiscordVoiceSession.create(client as never, destination);

    for (let recovery = 0; recovery < 20; recovery += 1) {
      voice.player.emit("idle");
    }

    const streams = voice.createAudioResource.mock.calls.map(([stream]) => stream);
    expect(streams).toHaveLength(21);
    expect(new Set(streams).size).toBe(21);
    for (const stream of streams.slice(0, -1)) {
      expect(stream.destroyed).toBe(true);
      expect(stream.listenerCount("close")).toBeLessThanOrEqual(1);
      expect(stream.listenerCount("end")).toBeLessThanOrEqual(1);
      expect(stream.listenerCount("error")).toBeLessThanOrEqual(1);
      expect(stream.listenerCount("finish")).toBeLessThanOrEqual(1);
    }

    await session.close();
    expect(streams.at(-1)?.destroyed).toBe(true);
    expect(voice.player.stop).toHaveBeenCalledOnce();
    expect(voice.connection.destroy).toHaveBeenCalledOnce();
  });
});
