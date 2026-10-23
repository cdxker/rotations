import { NCCOBuilder, Notify, Stream } from "@vonage/voice";
import { vonageApiSecret } from "../clients.js";

export function buildRequestedSongNcco({
  url,
  uuid,
  requestId,
  title,
}: {
  url: string;
  uuid: string;
  requestId: string;
  title: string;
}) {
  const mediaUrl = new URL(
    `/requested-song/${encodeURIComponent(uuid)}/${encodeURIComponent(requestId)}`,
    url,
  );
  mediaUrl.searchParams.set("secret", vonageApiSecret);
  const inputUrl = new URL("/input/digit", url);
  inputUrl.searchParams.set("uuid", uuid);
  const finishedUrl = new URL(
    `/requested-song/finished/${encodeURIComponent(uuid)}/${encodeURIComponent(requestId)}`,
    url,
  );

  return new NCCOBuilder()
    .addAction({ action: "talk", text: `Playing ${title}.` })
    .addAction({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: [inputUrl.toString()],
      eventMethod: "POST",
    })
    .addAction(new Stream(mediaUrl.toString()))
    .addAction(new Notify({ uuid }, finishedUrl.toString(), "POST"))
    .build();
}
