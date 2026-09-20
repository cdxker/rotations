type BuildDiscordBridgeNccoOptions = {
  url: string;
  uuid: string;
  destinationName: string;
  memberCount: number;
  websocketSecret: string;
};

export function buildDiscordBridgeNcco({
  url,
  uuid,
  destinationName,
  memberCount,
  websocketSecret,
}: BuildDiscordBridgeNccoOptions) {
  const digitInputUrl = new URL("/input/digit", url);
  digitInputUrl.searchParams.set("uuid", uuid);
  const eventUrl = new URL("/discord/event", url);
  eventUrl.searchParams.set("uuid", uuid);
  const websocketUrl = new URL("/discord/audio", url);
  websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";
  websocketUrl.searchParams.set("uuid", uuid);

  return [
    {
      action: "talk",
      text:
        memberCount === 1
          ? `There is 1 member in ${destinationName}. Connecting now.`
          : `There are ${memberCount} members in ${destinationName}. Connecting now.`,
    },
    {
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: [digitInputUrl.toString()],
      eventMethod: "POST",
    },
    {
      action: "connect",
      eventType: "synchronous",
      eventUrl: [eventUrl.toString()],
      eventMethod: "POST",
      endpoint: [
        {
          type: "websocket",
          uri: websocketUrl.toString(),
          "content-type": "audio/l16;rate=16000",
          authorization: {
            type: "custom",
            value: `Bearer ${websocketSecret}`,
          },
        },
      ],
    },
  ];
}

export function buildDiscordBusyNcco() {
  return [
    {
      action: "talk",
      text: "That Discord server is already connected to another voice channel. Returning to music.",
    },
  ];
}
