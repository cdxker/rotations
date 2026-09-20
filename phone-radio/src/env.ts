import { cleanEnv, num, str } from "envalid";
import { parseDiscordBridgeConfig } from "./discord/config.js";
import { DiscordDestinationRegistry } from "./discord/destination-registry.js";
import { playlists } from "./playlists/index.js";

export const env = cleanEnv(process.env, {
  VONAGE_API_SECRET: str(),
  VONAGE_APPLICATION_ID: str(),
  VONAGE_PRIVATE_KEY_PATH: str({ default: "./private.key" }),
  PORT: num({ default: 3010 }),
  REDIS_URL: str({ default: "redis://127.0.0.1:6379" }),
});

export const discordBridgeConfig = parseDiscordBridgeConfig(
  process.env,
  playlists.map((playlist) => playlist.number),
);

export const discordDestinationRegistry = new DiscordDestinationRegistry(
  discordBridgeConfig.destinations,
);
