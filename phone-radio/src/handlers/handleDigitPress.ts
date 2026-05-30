import { type } from "arktype";
import { NCCOBuilder, Stream } from "@vonage/voice";
import type { Request, Response } from "express";
import { trackIndexes, voiceClient } from "./phoneRadio.js";
import { baseUrl } from "../utils/baseUrl.js";

const callTrackState = new Map<string, number>();

const digitPressRequest = type({
    query: {
        uuid: "string",
    },
    body: {
        dtmf: {
            digits: "string",
        },
    },
});

export async function handleDigitPress(req: Request, res: Response): Promise<void> {
    const parsedRequest = digitPressRequest({ query: req.query, body: req.body });

    if (parsedRequest instanceof type.errors) {
        res.status(400).json({ error: `Invalid Vonage DTMF request: ${parsedRequest.summary}` });
        return;
    }

    const { uuid } = parsedRequest.query;
    const { digits } = parsedRequest.body.dtmf;

    if (digits !== "2") {
        res.status(204).send();
        return;
    }

    const currentTrackIndex = callTrackState.get(uuid) ?? 0;
    const nextTrackIndex = (currentTrackIndex + 1) % trackIndexes.length;
    callTrackState.set(uuid, nextTrackIndex);

    const url = baseUrl(req);
    const ncco = new NCCOBuilder().addAction({
        action: "input",
        type: ["dtmf"],
        mode: "asynchronous",
    });

    for (let offset = 0; offset < trackIndexes.length; offset++) {
        const index = (nextTrackIndex + offset) % trackIndexes.length;
        const trackUrl = new URL(`/track/${index}`, url);
        ncco.addAction(new Stream(trackUrl.toString(), undefined, undefined, 1));
    }

    await voiceClient.transferCallWithNCCO(uuid, ncco.build());

    res.status(204).send();
}
