import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type } from "arktype";
import { cleanEnv, str } from "envalid";
import { Input, NCCOBuilder, Stream, Voice, Wait } from "@vonage/voice";
import type { Request, Response } from "express";

const env = cleanEnv(process.env, {
    VONAGE_API_SECRET: str(),
    VONAGE_APPLICATION_ID: str(),
    VONAGE_PRIVATE_KEY_PATH: str({ default: "./private.key" }),
});

export const trackIndexes = [0, 1, 2, 3];

export const voiceClient = new Voice({
    applicationId: env.VONAGE_APPLICATION_ID,
    privateKey: readFileSync(resolve(env.VONAGE_PRIVATE_KEY_PATH), "utf8"),
});

const answerRequestSchema = type({
    query: {
        "uuid?": "string",
    },
    body: {
        "uuid?": "string",
    },
});

function baseUrl(req: Request): string {
    const proto = req.header("x-forwarded-proto") ?? req.protocol;
    const host = req.header("x-forwarded-host") ?? req.header("host");
    return `${proto}://${host}`;
}

export function phoneRadio(req: Request, res: Response): void {
    const parsedRequest = answerRequestSchema({
        query: req.query,
        body: req.body,
    });

    if (parsedRequest instanceof type.errors) {
        res.status(400).json({ error: `Invalid Vonage answer request: ${parsedRequest.summary}` });
        return;
    }

    const uuid = parsedRequest.query.uuid ?? parsedRequest.body.uuid ?? "";
    if (!uuid) {
        res.status(400).json({ error: "Missing Vonage call uuid." });
        return;
    }

    setTimeout(() => {
        void voiceClient.playDTMF(uuid, "1")
    }, 1_000);

    const digitPressUrl = new URL("/handleDigitPress", baseUrl(req));
    digitPressUrl.searchParams.set("uuid", uuid);

    const ncco = new NCCOBuilder()
        .addAction(new Wait(2))
        .addAction(new Input({ timeOut: 60, maxDigits: 1 }, undefined, digitPressUrl.toString(), "POST"));

    for (const index of trackIndexes) {
        const trackUrl = new URL(`/track/${index}`, baseUrl(req));
        trackUrl.searchParams.set("secret", env.VONAGE_API_SECRET);
        ncco.addAction(new Stream(trackUrl.toString(), undefined, undefined, 1));
    }

    res.json(ncco.build());
}
