import { stat } from "node:fs/promises";
import type { Request, Response } from "express";

const tracks = [
    "/home/cdxker/Music/telli-prego/mouthpiece-over-matter/01 - turn-it-up-ft-peter-feliciano-produced-by-freaqshow.mp3",
    "/home/cdxker/Music/telli-prego/mouthpiece-over-matter/02 - dont-settle-ft-baby-blak-produced-by-loopholes.mp3",
    "/home/cdxker/Music/telli-prego/mouthpiece-over-matter/03 - flawless-ft-equipto-spank-pops-produced-by-the-blacksmiths.mp3",
    "/home/cdxker/Music/telli-prego/mouthpiece-over-matter/04 - do-what-i-wanna-do-produced-by-the-blacksmiths.mp3",
];

export async function track(req: Request, res: Response): Promise<void> {
    const index = Number.parseInt(req.params.index ?? "", 10);
    const trackPath = tracks[index];

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
}
