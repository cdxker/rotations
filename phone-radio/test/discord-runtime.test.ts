import { describe, expect, it, vi } from "vitest";
import {
  ChannelType,
  Collection,
  type Client,
  type GuildMember,
} from "discord.js";
import type { DiscordBridgeConfig } from "../src/discord/config.js";
import {
  DiscordRuntime,
  type DiscordClientAdapter,
} from "../src/discord/runtime.js";

const enabledConfig: DiscordBridgeConfig = {
  enabled: true,
  botToken: "bot-token",
  websocketSecret: "websocket-secret",
  idleMs: 30_000,
  destinations: [
    { code: "80", name: "Office", guildId: "guild-1", channelId: "channel-1" },
  ],
};

function makeAdapter({
  client,
  login,
  destinationAvailable = true,
}: {
  client?: Client;
  login?: () => Promise<void>;
  destinationAvailable?: boolean;
} = {}): DiscordClientAdapter & {
  destroy: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  validateDestination: ReturnType<typeof vi.fn>;
} {
  return {
    client: client ?? null,
    login: vi.fn(login ?? (async () => undefined)),
    validateDestination: vi.fn(async () => destinationAvailable),
    destroy: vi.fn(),
  };
}

describe("DiscordRuntime", () => {
  it("stays disabled without Discord configuration", async () => {
    const createClient = vi.fn(() => makeAdapter());
    const runtime = new DiscordRuntime(
      { enabled: false, destinations: [], idleMs: 30_000 },
      createClient,
    );

    await expect(runtime.start()).resolves.toBe(false);
    expect(runtime.status).toBe("disabled");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("logs in, validates every destination, and becomes available", async () => {
    const adapter = makeAdapter();
    const runtime = new DiscordRuntime(enabledConfig, () => adapter);

    await expect(runtime.start()).resolves.toBe(true);
    expect(runtime.status).toBe("available");
    expect(runtime.available).toBe(true);
    expect(adapter.login).toHaveBeenCalledWith("bot-token");
    expect(adapter.validateDestination).toHaveBeenCalledWith(
      enabledConfig.destinations[0],
    );
    expect(runtime.isDestinationAvailable("80")).toBe(true);
    expect(runtime.isDestinationAvailable("81")).toBe(false);

    runtime.stop();
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expect(runtime.status).toBe("stopped");
  });

  it("counts current voice members without counting the phone radio bot", async () => {
    const members = new Collection<string, GuildMember>([
      ["bot-user", { id: "bot-user" } as GuildMember],
      ["listener-1", { id: "listener-1" } as GuildMember],
      ["listener-2", { id: "listener-2" } as GuildMember],
    ]);
    const fetchChannel = vi.fn(async () => ({
      members,
      type: ChannelType.GuildVoice,
    }));
    const client = {
      guilds: {
        fetch: vi.fn(async () => ({
          channels: { fetch: fetchChannel },
        })),
      },
      user: { id: "bot-user" },
    } as unknown as Client;
    const runtime = new DiscordRuntime(enabledConfig, () =>
      makeAdapter({ client }),
    );

    await runtime.start();

    await expect(
      runtime.getDestinationMemberCount(enabledConfig.destinations[0]!),
    ).resolves.toBe(2);
    expect(client.guilds.fetch).toHaveBeenCalledWith("guild-1");
    expect(fetchChannel).toHaveBeenCalledWith("channel-1");
  });

  it("keeps music online when login fails and allows a later retry", async () => {
    const failedAdapter = makeAdapter({
      login: async () => {
        throw new Error("Discord unavailable");
      },
    });
    const healthyAdapter = makeAdapter();
    const createClient = vi
      .fn<() => DiscordClientAdapter>()
      .mockReturnValueOnce(failedAdapter)
      .mockReturnValueOnce(healthyAdapter);
    const runtime = new DiscordRuntime(enabledConfig, createClient);

    await expect(runtime.start()).resolves.toBe(false);
    expect(runtime.status).toBe("unavailable");
    expect(failedAdapter.destroy).toHaveBeenCalledTimes(1);
    expect(runtime.isDestinationAvailable("80")).toBe(false);

    await expect(runtime.start()).resolves.toBe(true);
    expect(runtime.status).toBe("available");
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("marks the bridge unavailable when no destination can be joined", async () => {
    const adapter = makeAdapter({ destinationAvailable: false });
    const logValidationError = vi.fn();
    const runtime = new DiscordRuntime(
      enabledConfig,
      () => adapter,
      logValidationError,
    );

    await expect(runtime.start()).resolves.toBe(false);
    expect(runtime.status).toBe("unavailable");
    expect(adapter.destroy).toHaveBeenCalledTimes(1);
    expect(logValidationError).toHaveBeenCalledWith(
      "Discord destination 80 (Office, channel channel-1) failed validation: validation returned unavailable",
    );
  });

  it("keeps reachable destinations available when another one is unavailable", async () => {
    const adapter = makeAdapter();
    vi.mocked(adapter.validateDestination)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("Unknown Guild"));
    const logValidationError = vi.fn();
    const runtime = new DiscordRuntime(
      {
        ...enabledConfig,
        destinations: [
          ...enabledConfig.destinations,
          { code: "81", name: "Unavailable", guildId: "guild-2", channelId: "channel-2" },
        ],
      },
      () => adapter,
      logValidationError,
    );

    await expect(runtime.start()).resolves.toBe(true);
    expect(runtime.isDestinationAvailable("80")).toBe(true);
    expect(runtime.isDestinationAvailable("81")).toBe(false);
    expect(logValidationError).toHaveBeenCalledWith(
      "Discord destination 81 (Unavailable, channel channel-2) failed validation: Unknown Guild",
    );
  });
});
