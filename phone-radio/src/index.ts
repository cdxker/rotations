import "dotenv/config";
import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { NCCOBuilder, Stream, Voice, Wait } from "@vonage/voice";
import { type } from "arktype";
import { cleanEnv, str } from "envalid";
import express from "express";
import type { Request, Response } from "express";
import { pinoHttp } from "pino-http";

const env = cleanEnv(process.env, {
  VONAGE_API_SECRET: str(),
  VONAGE_APPLICATION_ID: str(),
  VONAGE_PRIVATE_KEY_PATH: str({ default: "./private.key" }),
});

export const voiceClient = new Voice({
  applicationId: env.VONAGE_APPLICATION_ID,
  privateKey: readFileSync(resolve(env.VONAGE_PRIVATE_KEY_PATH), "utf8"),
});

const app = express();
const port = 3010;

app.use(pinoHttp());
app.use(express.json());

const tracks = [
  "/home/cdxker/Music/Ricky/2MYGRAVE & LUCKI - Lost Time (prod. Plu2o Nash) [NGgtGPwo38A].mp3",
  "/home/cdxker/Music/Ricky/LUCKI - Str8 Syrup (Official Visualizer) [_xC2eRwfg6E].mp3",
  "/home/cdxker/Music/Ricky/MurdaGang PB - 5k 6k (Official Video) [sy0-yjWyOqg].mp3",
  "/home/cdxker/Music/Ricky/YoungBoy Never Broke Again - Seeming Like It [Official Audio] [Ol6x1bbVn9g].mp3",
  "/home/cdxker/Music/Ricky/6LACK - PRBLMS [Official Music Video] [fS9m0Ac8PCU].mp3",
  "/home/cdxker/Music/Ricky/Lil Yachty - Child Boy (FREESTYLE) [lCco3xoy8cY].mp3",
  "/home/cdxker/Music/Ricky/Z-RO - Lonely [H5srCqjVnw0].mp3",
  "/home/cdxker/Music/Ricky/DeeBaby - Never Gon End ( Official Video ) [0Gv0avlPA4E].mp3",
  "/home/cdxker/Music/Ricky/Drake - What Did I Miss？ (Official Music Video) with Lyrics [77P9wJGmAIE].mp3",
  "/home/cdxker/Music/Ricky/Kevin Gates - Stop Lyin [Official Audio] [Z6BHYQ10a8Y].mp3",
  "/home/cdxker/Music/Ricky/UGK (Underground Kingz) - Da Game Been Good To Me (Official Video) [6DivB-ih4Rw].mp3",
  "/home/cdxker/Music/Ricky/Loe Shimmy - You Decide (Official Music Video) [dSIGRRS8Zwk].mp3",
  "/home/cdxker/Music/Ricky/Kodak Black - Super Gremlin [Official Music Video] [kiB9qk4gnt4].mp3",
  "/home/cdxker/Music/Ricky/Kodak Black - Cyber Truck [Official Video] [O9x1QBbB7QM].mp3",
  // "/home/cdxker/Music/Ricky/Pooh Shiesty - FDO [Official Music Video] [MPuK06zUIhc].mp3",
  "/home/cdxker/Music/Ricky/A.P.E [m0VUP8h5Dw0].mp3",
  "/home/cdxker/Music/Ricky/Im Free (feat. PoohShiesty) [QtWPSXHd4ZQ].mp3",
  // "/home/cdxker/Music/Ricky/Make Them Know [GmoK54ygg_I].mp3", // Drake
  "/home/cdxker/Music/Ricky/kendrick lamar - bitch don't kill my vibe (slowed + reverb) [jmV0TOAtaHU].mp3",
  "/home/cdxker/Music/Ricky/Think Its Over [-hOx0ct9Lkk].mp3",
  "/home/cdxker/Music/Ricky/Jean Grey (produced by kyslingo & lammbeats) [l05j3Mz5wqQ].mp3",
  "/home/cdxker/Music/Ricky/Dey Lying [7CePUgAQzPw].mp3",
  "/home/cdxker/Music/Ricky/Fyri/imstilldead_.mp3",
  "/home/cdxker/Music/Ricky/Fyri/_nightofthedead.mp3",
  "/home/cdxker/Music/Ricky/Fyri/Backfromthe_dead.mp3",
  "/home/cdxker/Music/Drake/DRAKE  - JANICE STFU (LYRICS⧸LETRA) english-spanish [NlfyxSKrjA0].mp3"
];



// Answer phone 
// 

const answerPhoneRequestParser = type({
  body: {
    uuid: "string",
  },
});

app.post("/answer", (req: Request, res: Response) => {
  const request = answerPhoneRequestParser(req);
  const url = baseUrl(req);

  if (request instanceof type.errors) {
    res.status(400).json({
      error: `Invalid Vonage answer request: ${request.summary}`,
    });
    return;
  }
  const { uuid } = request.body;

  setTimeout(() => {
    const digitPressUrl = new URL("/handleDigitPress", url);
    digitPressUrl.searchParams.set("uuid", uuid);

    void voiceClient
      .subscribeDTMF(uuid, digitPressUrl.toString())
      .catch((error: unknown) => {
        req.log.error({ error }, "Failed to subscribe to Vonage DTMF events");
      });
  }, 1_000);

  setTimeout(() => {
    void voiceClient.playDTMF(uuid, "1");
  }, 5_000);

  const callControl = new NCCOBuilder().addAction(new Wait(2)).addAction({
    action: "input",
    type: ["dtmf"],
    mode: "asynchronous",
  });

  for (let index = 0; index < tracks.length; index++) {
    const trackUrl = new URL(`/track/${index}`, url);
    trackUrl.searchParams.set("secret", env.VONAGE_API_SECRET);
    callControl.addAction(new Stream(trackUrl.toString(), undefined, undefined, 1));
  }

  res.json(callControl.build());
});


/// Load Track

const loadTrackRequestParser = type({
  params: {
    index: "string",
  },
});

app.get("/track/:index", async (req: Request, res: Response) => {
  const request = loadTrackRequestParser(req);
  if (request instanceof type.errors) {
    res.status(400).json({
      error: request.summary,
    });
    return;
  }

  const { index } = request.params;
  const trackPath = tracks[parseInt(index)];

  if (!trackPath) {
    res.status(404).send("Track not found.");
    return;
  }

  try {
    const trackStat = await stat(trackPath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", trackStat.size.toString());
    res.sendFile(trackPath);
  } catch {
    res.status(404).send("Track file not found.");
  }
});

app.listen(port, () => {
  console.log(`Phone radio server listening on http://localhost:${port}`);
});


  // utils

function baseUrl(req: Request): string {
  const proto = req.header("x-forwarded-proto") ?? req.protocol;
  const host = req.header("x-forwarded-host") ?? req.header("host");
  return `${proto}://${host}`;
}
