type BuildPlaylistSelectionNccoOptions = {
  url: string;
  uuid: string;
};

export function buildPlaylistSelectionNcco({
  url,
  uuid,
}: BuildPlaylistSelectionNccoOptions) {
  const inputUrl = new URL("/input/playlist", url);
  inputUrl.searchParams.set("uuid", uuid);

  return [
    {
      action: "talk",
      text: "Press tbe playlist number followed by the pound sign.",
    },
    {
      action: "input",
      type: ["dtmf"],
      dtmf: {
        maxDigits: 20,
        submitOnHash: true,
        timeOut: 10,
      },
      eventUrl: [inputUrl.toString()],
      eventMethod: "POST",
      mode: "synchronous",
    },
  ];
}
