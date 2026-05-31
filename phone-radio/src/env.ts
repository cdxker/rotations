import { cleanEnv, num, str } from "envalid";

export const env = cleanEnv(process.env, {
  VONAGE_API_SECRET: str(),
  VONAGE_APPLICATION_ID: str(),
  VONAGE_PRIVATE_KEY_PATH: str({ default: "./private.key" }),
  PORT: num({ default: 3010 }),
});

