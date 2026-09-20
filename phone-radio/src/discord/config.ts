export const DEFAULT_DISCORD_BRIDGE_IDLE_MS = 30_000;

export type DiscordVoiceDestination = Readonly<{
  code: string;
  name: string;
  guildId: string;
  channelId: string;
}>;

export type DisabledDiscordBridgeConfig = Readonly<{
  enabled: false;
  destinations: readonly DiscordVoiceDestination[];
  idleMs: number;
}>;

export type EnabledDiscordBridgeConfig = Readonly<{
  enabled: true;
  botToken: string;
  destinations: readonly DiscordVoiceDestination[];
  idleMs: number;
  websocketSecret: string;
}>;

export type DiscordBridgeConfig =
  | DisabledDiscordBridgeConfig
  | EnabledDiscordBridgeConfig;

export class DiscordBridgeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordBridgeConfigError";
  }
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function optionalValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

function parseIdleMs(rawIdleMs: string | undefined): number {
  if (rawIdleMs === undefined) {
    return DEFAULT_DISCORD_BRIDGE_IDLE_MS;
  }

  const idleMs = Number(rawIdleMs);

  if (!Number.isSafeInteger(idleMs) || idleMs <= 0) {
    throw new DiscordBridgeConfigError(
      "DISCORD_BRIDGE_IDLE_MS must be a positive integer.",
    );
  }

  return idleMs;
}

function requireDestinationField(
  destination: Record<string, unknown>,
  field: keyof DiscordVoiceDestination,
  index: number,
): string {
  const value = destination[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DiscordBridgeConfigError(
      `Discord destination ${index} must have a non-empty ${field}.`,
    );
  }

  return value.trim();
}

function parseDestinations(
  rawDestinations: string,
  _musicPlaylistNumbers: readonly string[],
): readonly DiscordVoiceDestination[] {
  let parsedDestinations: unknown;

  try {
    parsedDestinations = JSON.parse(rawDestinations);
  } catch {
    throw new DiscordBridgeConfigError(
      "DISCORD_VOICE_DESTINATIONS must be a valid JSON array.",
    );
  }

  if (!Array.isArray(parsedDestinations) || parsedDestinations.length === 0) {
    throw new DiscordBridgeConfigError(
      "DISCORD_VOICE_DESTINATIONS must contain at least one destination.",
    );
  }

  const destinationCodes = new Set<string>();

  return Object.freeze(
    parsedDestinations.map((rawDestination, index) => {
      if (
        typeof rawDestination !== "object" ||
        rawDestination === null ||
        Array.isArray(rawDestination)
      ) {
        throw new DiscordBridgeConfigError(
          `Discord destination ${index} must be an object.`,
        );
      }

      const destination = rawDestination as Record<string, unknown>;
      const code = requireDestinationField(destination, "code", index);

      if (!/^\d+$/.test(code)) {
        throw new DiscordBridgeConfigError(
          `Discord destination ${index} code must contain only digits.`,
        );
      }

      if (code === "99") {
        throw new DiscordBridgeConfigError(
          "Discord destination code 99 is reserved for the live AI agent.",
        );
      }

      if (destinationCodes.has(code)) {
        throw new DiscordBridgeConfigError(
          `Discord destination code ${code} is duplicated.`,
        );
      }

      destinationCodes.add(code);

      return Object.freeze({
        code,
        name: requireDestinationField(destination, "name", index),
        guildId: requireDestinationField(destination, "guildId", index),
        channelId: requireDestinationField(destination, "channelId", index),
      });
    }),
  );
}

export function parseDiscordBridgeConfig(
  source: EnvironmentSource,
  musicPlaylistNumbers: readonly string[],
): DiscordBridgeConfig {
  const botToken = optionalValue(source.DISCORD_BOT_TOKEN);
  const rawDestinations = optionalValue(source.DISCORD_VOICE_DESTINATIONS);
  const websocketSecret = optionalValue(source.VONAGE_WEBSOCKET_SECRET);
  const idleMs = parseIdleMs(optionalValue(source.DISCORD_BRIDGE_IDLE_MS));

  if (!botToken && !rawDestinations) {
    return Object.freeze({
      enabled: false,
      destinations: Object.freeze([]),
      idleMs,
    });
  }

  if (!botToken || !rawDestinations || !websocketSecret) {
    throw new DiscordBridgeConfigError(
      "DISCORD_BOT_TOKEN, DISCORD_VOICE_DESTINATIONS, and VONAGE_WEBSOCKET_SECRET must be configured together.",
    );
  }

  return Object.freeze({
    enabled: true,
    botToken,
    destinations: parseDestinations(rawDestinations, musicPlaylistNumbers),
    idleMs,
    websocketSecret,
  });
}
