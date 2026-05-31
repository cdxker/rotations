import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Voice } from "@vonage/voice";
import { env } from "./env.js";

export const vonageApiSecret = env.VONAGE_API_SECRET;

export const voiceClient = new Voice({
  applicationId: env.VONAGE_APPLICATION_ID,
  privateKey: readFileSync(resolve(env.VONAGE_PRIVATE_KEY_PATH), "utf8"),
});
