import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Voice } from "@vonage/voice";
import { Redis } from "ioredis";
import { DiscordBridgeManager } from "./discord/bridge-manager.js";
import { DiscordVoiceSession } from "./discord/discord-voice-session.js";
import { DiscordRuntime } from "./discord/runtime.js";
import { discordBridgeConfig, env } from "./env.js";

export const vonageApiSecret = env.VONAGE_API_SECRET;

export const voiceClient = new Voice({
  applicationId: env.VONAGE_APPLICATION_ID,
  privateKey: readFileSync(resolve(env.VONAGE_PRIVATE_KEY_PATH), "utf8"),
});

export const redisClient = new Redis(env.REDIS_URL);

export const discordRuntime = new DiscordRuntime(discordBridgeConfig);

export const discordBridgeManager = new DiscordBridgeManager({
  idleMs: discordBridgeConfig.idleMs,
  async createSession(destination) {
    const client = discordRuntime.getClient();
    if (!client) {
      throw new Error("Discord voice bridge is unavailable.");
    }
    return DiscordVoiceSession.create(client, destination);
  },
});
