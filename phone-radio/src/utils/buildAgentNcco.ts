export function buildAgentNcco({ url, uuid, sessionId, websocketSecret }: {
  url: string;
  uuid: string;
  sessionId: string;
  websocketSecret: string;
}) {
  const audioUrl = new URL("/agent/audio", url);
  audioUrl.protocol = audioUrl.protocol === "https:" ? "wss:" : "ws:";
  const eventUrl = new URL("/agent/event", url);
  for (const endpoint of [audioUrl, eventUrl]) {
    endpoint.searchParams.set("uuid", uuid);
    endpoint.searchParams.set("sessionId", sessionId);
  }
  return [
    { action: "talk", text: "Connecting you to our live AI agent. Press 9 to return to the menu." },
    {
      action: "connect",
      eventType: "synchronous",
      eventUrl: [eventUrl.toString()],
      eventMethod: "POST",
      endpoint: [{
        type: "websocket",
        uri: audioUrl.toString(),
        "content-type": "audio/l16;rate=16000",
        authorization: { type: "custom", value: `Bearer ${websocketSecret}` },
      }],
    },
  ];
}
