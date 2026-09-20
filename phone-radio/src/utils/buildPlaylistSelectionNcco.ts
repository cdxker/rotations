type BuildPlaylistSelectionNccoOptions = {
  url: string;
  uuid: string;
  selectorId: string;
};

export function buildPlaylistSelectionNcco({
  url,
  uuid,
  selectorId,
}: BuildPlaylistSelectionNccoOptions) {
  const inputUrl = new URL("/input/playlist", url);
  inputUrl.searchParams.set("uuid", uuid);
  inputUrl.searchParams.set("selectorId", selectorId);

  return [
    {
      action: "talk",
      text: "Enter a playlist number followed by pound, or enter 99 followed by pound to talk to our AI agent.",
    },
    {
      action: "input",
      type: ["dtmf"],
      dtmf: {
        maxDigits: 2,
        submitOnHash: true,
        timeOut: 10,
      },
      eventUrl: [inputUrl.toString()],
      eventMethod: "POST",
      mode: "synchronous",
    },
  ];
}
