import { type } from "arktype";
import { Input, NCCOBuilder, Stream } from "@vonage/voice";
import type { Request, Response } from "express";
import { trackIndexes, voiceClient } from "./phoneRadio.js";

const callTrackState = new Map<string, number>();

const digitPressSchema = type({
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
    const parsedRequest = digitPressSchema({
        query: req.query,
        body: req.body,
    });

    if (parsedRequest instanceof type.errors) {
        res.status(400).json({ error: `Invalid Vonage DTMF request: ${parsedRequest.summary}` });
        return;
    }

    if (parsedRequest.body.dtmf.digits !== "2") {
        res.status(204).send();
        return;
    }

    const currentTrackIndex = callTrackState.get(parsedRequest.query.uuid) ?? 0;
    const nextTrackIndex = (currentTrackIndex + 1) % trackIndexes.length;
    callTrackState.set(parsedRequest.query.uuid, nextTrackIndex);

    const proto = req.header("x-forwarded-proto") ?? req.protocol;
    const host = req.header("x-forwarded-host") ?? req.header("host");
    const baseUrl = `${proto}://${host}`;
    const digitPressUrl = new URL("/handleDigitPress", baseUrl);
    digitPressUrl.searchParams.set("uuid", parsedRequest.query.uuid);

    const ncco = new NCCOBuilder().addAction(
        new Input({ timeOut: 60, maxDigits: 1 }, undefined, digitPressUrl.toString(), "POST")
    );

    for (let offset = 0; offset < trackIndexes.length; offset++) {
        const index = (nextTrackIndex + offset) % trackIndexes.length;
        const trackUrl = new URL(`/track/${index}`, baseUrl);
        ncco.addAction(new Stream(trackUrl.toString(), undefined, undefined, 1));
    }

    await voiceClient.transferCallWithNCCO(parsedRequest.query.uuid, ncco.build());

    res.status(204).send();
}
