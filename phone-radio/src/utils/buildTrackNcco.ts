import { NCCOBuilder, Notify, Stream } from "@vonage/voice";
import { vonageApiSecret } from "../clients.js";
import { playlistCatalog } from "../playlists/catalog.js";

type BuildTrackNccoOptions = {
  url: string;
  uuid: string;
  playlistNumber: string;
  trackIndex: number;
  catalogRevision?: string;
  announceTrack: boolean;
  messages?: string[];
};

export function buildTrackNcco({
  url,
  uuid,
  playlistNumber,
  trackIndex,
  catalogRevision,
  announceTrack,
  messages = [],
}: BuildTrackNccoOptions) {
  const revision = catalogRevision ?? playlistCatalog.current(playlistNumber)?.revision;
  if (!revision) throw new Error("Cannot queue a track without its playlist revision.");
  const revisionQuery = `catalogRevision=${encodeURIComponent(revision)}`;
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
        )}/${trackIndex}?secret=${vonageApiSecret}&${revisionQuery}`,
      ),
    )
    .addAction(
      new Notify(
        { uuid },
        `${url}/track/finished/${encodeURIComponent(
          uuid,
        )}/${encodeURIComponent(playlistNumber)}/${trackIndex}?${revisionQuery}`,
        "POST",
      ),
    );

  return callControl.build();
}
