import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISCORD_BRIDGE_IDLE_MS,
  DiscordBridgeConfigError,
  parseDiscordBridgeConfig,
} from "../src/discord/config.js";
import { DiscordDestinationRegistry } from "../src/discord/destination-registry.js";

const musicCodes = ["1", "2", "9"];

const configuredEnvironment = {
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_VOICE_DESTINATIONS: JSON.stringify([
    {
      code: "80",
      name: "Office",
      guildId: "guild-1",
      channelId: "channel-1",
    },
  ]),
  VONAGE_WEBSOCKET_SECRET: "websocket-secret",
};

describe("parseDiscordBridgeConfig", () => {
  it("leaves Discord disabled when no Discord configuration is supplied", () => {
    expect(parseDiscordBridgeConfig({}, musicCodes)).toEqual({
      enabled: false,
      destinations: [],
      idleMs: DEFAULT_DISCORD_BRIDGE_IDLE_MS,
    });
  });

  it("parses enabled configuration and its optional idle timeout", () => {
    const config = parseDiscordBridgeConfig(
      { ...configuredEnvironment, DISCORD_BRIDGE_IDLE_MS: "45000" },
      musicCodes,
    );

    expect(config).toEqual({
      enabled: true,
      botToken: "bot-token",
      websocketSecret: "websocket-secret",
      idleMs: 45_000,
      destinations: [
        {
          code: "80",
          name: "Office",
          guildId: "guild-1",
          channelId: "channel-1",
        },
      ],
    });
  });

  it("allows a Discord destination to override a matching music playlist code", () => {
    const config = parseDiscordBridgeConfig(
      {
        ...configuredEnvironment,
        DISCORD_VOICE_DESTINATIONS: JSON.stringify([
          {
            code: "1",
            name: "Voice Chat 1",
            guildId: "guild-1",
            channelId: "channel-1",
          },
        ]),
      },
      musicCodes,
    );

    expect(config.destinations).toEqual([
      {
        code: "1",
        name: "Voice Chat 1",
        guildId: "guild-1",
        channelId: "channel-1",
      },
    ]);
  });

  it.each([
    [{ DISCORD_BOT_TOKEN: "bot-token" }, "configured together"],
    [
      { ...configuredEnvironment, DISCORD_VOICE_DESTINATIONS: "not-json" },
      "valid JSON array",
    ],
    [
      {
        ...configuredEnvironment,
        DISCORD_VOICE_DESTINATIONS: JSON.stringify([
          { code: "8x", name: "Office", guildId: "g", channelId: "c" },
        ]),
      },
      "only digits",
    ],
    [
      {
        ...configuredEnvironment,
        DISCORD_VOICE_DESTINATIONS: JSON.stringify([
          { code: "80", name: "One", guildId: "g", channelId: "c" },
          { code: "80", name: "Two", guildId: "g2", channelId: "c2" },
        ]),
      },
      "duplicated",
    ],
    [{ ...configuredEnvironment, DISCORD_BRIDGE_IDLE_MS: "0" }, "positive integer"],
  ])("rejects invalid configuration (%s)", (environment, message) => {
    expect(() => parseDiscordBridgeConfig(environment, musicCodes)).toThrow(
      DiscordBridgeConfigError,
    );
    expect(() => parseDiscordBridgeConfig(environment, musicCodes)).toThrow(
      message,
    );
  });
});

describe("DiscordDestinationRegistry", () => {
  it("looks up configured destinations by dial code", () => {
    const registry = new DiscordDestinationRegistry([
      { code: "80", name: "Office", guildId: "g1", channelId: "c1" },
      { code: "81", name: "Studio", guildId: "g2", channelId: "c2" },
    ]);

    expect(registry.size).toBe(2);
    expect(registry.getByCode("80")).toMatchObject({ name: "Office" });
    expect(registry.getByCode("missing")).toBeNull();
    expect(registry.has("81")).toBe(true);
    expect(registry.has("1")).toBe(false);
  });

  it("rejects duplicate codes if constructed without config validation", () => {
    expect(
      () =>
        new DiscordDestinationRegistry([
          { code: "80", name: "One", guildId: "g1", channelId: "c1" },
          { code: "80", name: "Two", guildId: "g2", channelId: "c2" },
        ]),
    ).toThrow("duplicated");
  });
});
