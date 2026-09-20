export type AgentConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true;
      apiKey: string;
      websocketSecret: string;
    }>;

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

export function parseAgentConfig(
  source: Readonly<Record<string, string | undefined>>,
): AgentConfig {
  const apiKey = source.OPENAI_API_KEY?.trim();
  const websocketSecret = source.VONAGE_WEBSOCKET_SECRET?.trim();

  // Discord can use the shared WebSocket secret without enabling the AI agent.
  if (!apiKey) return Object.freeze({ enabled: false });

  if (!websocketSecret) {
    throw new AgentConfigError(
      "VONAGE_WEBSOCKET_SECRET must be configured when OPENAI_API_KEY is set.",
    );
  }

  return Object.freeze({ enabled: true, apiKey, websocketSecret });
}
