import {
  ChannelType,
  Client,
  GatewayIntentBits,
  type VoiceChannel,
} from "discord.js";
import type {
  DiscordBridgeConfig,
  DiscordVoiceDestination,
} from "./config.js";

export const DISCORD_GATEWAY_INTENTS = Object.freeze([
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
]);

export type DiscordRuntimeStatus =
  | "disabled"
  | "idle"
  | "starting"
  | "available"
  | "unavailable"
  | "stopped";

export interface DiscordClientAdapter {
  readonly client: Client | null;
  login(botToken: string): Promise<void>;
  validateDestination(destination: DiscordVoiceDestination): Promise<boolean>;
  destroy(): void;
}

export type DiscordClientAdapterFactory = () => DiscordClientAdapter;
export type DiscordValidationErrorLogger = (message: string) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class DiscordJsClientAdapter implements DiscordClientAdapter {
  public readonly client: Client;

  constructor() {
    this.client = new Client({ intents: [...DISCORD_GATEWAY_INTENTS] });
  }

  public async login(botToken: string): Promise<void> {
    await this.client.login(botToken);
  }

  public async validateDestination(
    destination: DiscordVoiceDestination,
  ): Promise<boolean> {
    const guild = await this.client.guilds.fetch(destination.guildId);
    const channel = await guild.channels.fetch(destination.channelId);

    if (channel?.type !== ChannelType.GuildVoice) {
      throw new Error(
        `Configured channel is not a guild voice channel (type: ${channel?.type ?? "missing"})`,
      );
    }

    const voiceChannel: VoiceChannel = channel;
    const validation = {
      joinable: voiceChannel.joinable,
      speakable: voiceChannel.speakable,
      viewable: voiceChannel.viewable,
    };

    if (!validation.viewable || !validation.joinable || !validation.speakable) {
      throw new Error(
        `Voice channel access check failed (viewable=${validation.viewable}, joinable=${validation.joinable}, speakable=${validation.speakable})`,
      );
    }

    return true;
  }

  public destroy(): void {
    this.client.destroy();
  }
}

export class DiscordRuntime {
  readonly #config: DiscordBridgeConfig;
  readonly #createClient: DiscordClientAdapterFactory;
  readonly #logValidationError: DiscordValidationErrorLogger;
  #clientAdapter: DiscordClientAdapter | null = null;
  #availableDestinationCodes = new Set<string>();
  #startPromise: Promise<boolean> | null = null;
  #status: DiscordRuntimeStatus;

  constructor(
    config: DiscordBridgeConfig,
    createClient: DiscordClientAdapterFactory = () =>
      new DiscordJsClientAdapter(),
    logValidationError: DiscordValidationErrorLogger = console.error,
  ) {
    this.#config = config;
    this.#createClient = createClient;
    this.#logValidationError = logValidationError;
    this.#status = config.enabled ? "idle" : "disabled";
  }

  public get available(): boolean {
    return this.#status === "available";
  }

  public get status(): DiscordRuntimeStatus {
    return this.#status;
  }

  public getClient(): Client | null {
    return this.available ? (this.#clientAdapter?.client ?? null) : null;
  }

  public isDestinationAvailable(code: string): boolean {
    return (
      this.available &&
      this.#availableDestinationCodes.has(code)
    );
  }

  public async start(): Promise<boolean> {
    if (!this.#config.enabled) {
      return false;
    }

    if (this.available) {
      return true;
    }

    if (this.#startPromise) {
      return this.#startPromise;
    }

    this.#status = "starting";
    const startPromise = this.initialize();
    this.#startPromise = startPromise;

    try {
      return await startPromise;
    } finally {
      if (this.#startPromise === startPromise) {
        this.#startPromise = null;
      }
    }
  }

  public stop(): void {
    this.#clientAdapter?.destroy();
    this.#clientAdapter = null;
    this.#availableDestinationCodes.clear();
    this.#status = this.#config.enabled ? "stopped" : "disabled";
  }

  private async initialize(): Promise<boolean> {
    const config = this.#config;

    if (!config.enabled) {
      return false;
    }

    try {
      this.#clientAdapter = this.#createClient();
      await this.#clientAdapter.login(config.botToken);

      const destinationChecks = await Promise.allSettled(
        config.destinations.map((destination) =>
          this.#clientAdapter!.validateDestination(destination),
        ),
      );

      this.#availableDestinationCodes.clear();
      destinationChecks.forEach((check, index) => {
        const destination = config.destinations[index]!;

        if (check.status === "fulfilled" && check.value) {
          this.#availableDestinationCodes.add(destination.code);
          return;
        }

        const reason =
          check.status === "rejected"
            ? errorMessage(check.reason)
            : "validation returned unavailable";
        this.#logValidationError(
          `Discord destination ${destination.code} (${destination.name}, channel ${destination.channelId}) failed validation: ${reason}`,
        );
      });

      if (this.#availableDestinationCodes.size === 0) {
        throw new Error("A configured Discord destination is unavailable.");
      }

      this.#status = "available";
      return true;
    } catch {
      this.#clientAdapter?.destroy();
      this.#clientAdapter = null;
      this.#availableDestinationCodes.clear();
      this.#status = "unavailable";
      return false;
    }
  }
}
