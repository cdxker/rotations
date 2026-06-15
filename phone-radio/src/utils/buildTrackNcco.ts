import { NCCOBuilder, Notify, Stream } from "@vonage/voice";
import { vonageApiSecret } from "../clients.js";

type BuildTrackNccoOptions = {
  url: string;
  uuid: string;
  trackIndex: number;
  announceTrack: boolean;
};

export function buildTrackNcco({
  url,
  uuid,
  trackIndex,
  announceTrack,
}: BuildTrackNccoOptions) {
  const callControl = new NCCOBuilder();

  if (announceTrack) {
    callControl.addAction({
      action: "talk",
      text: `Song ${trackIndex + 1}.`,
    });
  }

  callControl
    .addAction({
      action: "input",
      type: ["dtmf"],
      mode: "asynchronous",
      eventUrl: [`${url}/input/digit?uuid=${uuid}`],
      eventMethod: "POST",
    })
    .addAction(
      new Stream(`${url}/track/${trackIndex}?secret=${vonageApiSecret}`),
    )
    .addAction(
      new Notify(
        { uuid },
        `${url}/track/finished/${uuid}/${trackIndex}`,
        "POST",
      ),
    );

  return callControl.build();
}
