import type { DiscordVoiceDestination } from "./config.js";

export class DiscordDestinationRegistry {
  readonly #destinations: readonly DiscordVoiceDestination[];
  readonly #destinationsByCode: ReadonlyMap<string, DiscordVoiceDestination>;

  constructor(destinations: readonly DiscordVoiceDestination[]) {
    const destinationsByCode = new Map<string, DiscordVoiceDestination>();

    for (const destination of destinations) {
      if (destinationsByCode.has(destination.code)) {
        throw new Error(
          `Discord destination code ${destination.code} is duplicated.`,
        );
      }

      destinationsByCode.set(destination.code, destination);
    }

    this.#destinations = Object.freeze([...destinations]);
    this.#destinationsByCode = destinationsByCode;
  }

  public get size(): number {
    return this.#destinations.length;
  }

  public getAll(): readonly DiscordVoiceDestination[] {
    return this.#destinations;
  }

  public getByCode(
    code: string | undefined,
  ): DiscordVoiceDestination | null {
    if (code === undefined) {
      return null;
    }

    return this.#destinationsByCode.get(code) ?? null;
  }

  public has(code: string): boolean {
    return this.#destinationsByCode.has(code);
  }
}
