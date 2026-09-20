import { describe, expect, it } from "vitest";
import { AgentConfigError, parseAgentConfig } from "../src/agent/config.js";

describe("parseAgentConfig", () => {
  it.each([{}, { VONAGE_WEBSOCKET_SECRET: "discord-secret" }, { OPENAI_API_KEY: "  " }])(
    "leaves AI disabled without an API key (%s)",
    (environment) => {
      expect(parseAgentConfig(environment)).toEqual({ enabled: false });
    },
  );

  it("enables AI independently of Discord and trims configuration", () => {
    expect(
      parseAgentConfig({
        OPENAI_API_KEY: " test-key ",
        VONAGE_WEBSOCKET_SECRET: " socket-secret ",
      }),
    ).toEqual({ enabled: true, apiKey: "test-key", websocketSecret: "socket-secret" });
  });

  it.each([undefined, "", "  "])("requires authenticated phone sockets (%s)", (secret) => {
    expect(() =>
      parseAgentConfig({ OPENAI_API_KEY: "test-key", VONAGE_WEBSOCKET_SECRET: secret }),
    ).toThrow(AgentConfigError);
    expect(() =>
      parseAgentConfig({ OPENAI_API_KEY: "test-key", VONAGE_WEBSOCKET_SECRET: secret }),
    ).toThrow("VONAGE_WEBSOCKET_SECRET must be configured when OPENAI_API_KEY is set.");
  });
});
