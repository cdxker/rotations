import "dotenv/config";
import express from "express";
import { handleDigitPress } from "./handlers/handleDigitPress.js";
import { phoneRadio } from "./handlers/phoneRadio.js";
import { track } from "./handlers/track.js";

const app = express();
const port = parseInt(process.env.PHONE_RADIO_PORT ?? "3010", 10);

app.use(express.json());
app.get("/answer", phoneRadio);
app.post("/answer", phoneRadio);
app.post("/handleDigitPress", handleDigitPress);
app.get("/track/:index", track);

app.listen(port, () => {
    console.log(`Phone radio server listening on http://localhost:${port}`);
});
