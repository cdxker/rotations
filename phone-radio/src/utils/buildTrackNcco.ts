import { NCCOBuilder, Notify, Stream } from "@vonage/voice";
import { vonageApiSecret } from "../clients.js";

type BuildTrackNccoOptions = {
  url: string;
  uuid: string;
  playlistNumber: string;
  trackIndex: number;
  announceTrack: boolean;
  messages?: string[];
};

export function buildTrackNcco({
  url,
  uuid,
  playlistNumber,
  trackIndex,
  announceTrack,
  messages = [],
}: BuildTrackNccoOptions) {
  const callControl = new NCCOBuilder();

  for (const message of messages) {
    callControl.addAction({
      action: "talk",
      text: message,
    });
  }

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
      new Stream(
        `${url}/track/${encodeURIComponent(
          playlistNumber,
        )}/${trackIndex}?secret=${vonageApiSecret}`,
      ),
    )
    .addAction(
      new Notify(
        { uuid },
        `${url}/track/finished/${encodeURIComponent(
          uuid,
        )}/${encodeURIComponent(playlistNumber)}/${trackIndex}`,
        "POST",
      ),
    );

  return callControl.build();
}
