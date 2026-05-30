import "dotenv/config";
import express, { type Request, type Response } from "express";

export async function phoneRadio(_req: Request, res: Response): Promise<void> {
    res.status(501).json({
        results: [],
        error: "phoneRadio scaffold is ready; Spotify actions are not implemented yet.",
    });
}

const app = express();
const port = parseInt(process.env.PHONE_RADIO_PORT ?? "3010", 10);

app.use(express.json());
app.post("/vapi", phoneRadio);

app.listen(port, () => {
    console.log(`Phone radio server listening on http://localhost:${port}`);
});
