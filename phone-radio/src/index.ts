import "dotenv/config";
import express, { type Request, type Response } from "express";

interface VapiToolCall {
    id?: string;
    toolCallId?: string;
    name?: string;
    arguments?: unknown;
    parameters?: unknown;
    function?: {
        name?: string;
        arguments?: unknown;
    };
}

interface VapiWebhookBody {
    message?: {
        type?: string;
        toolCallList?: VapiToolCall[];
        toolCalls?: VapiToolCall[];
    };
}

interface SpotifyTrack {
    id: string;
    uri: string;
    name: string;
    artists: { name: string }[];
}

interface SpotifySearchResponse {
    tracks?: {
        items?: SpotifyTrack[];
    };
}

export async function phoneRadio(req: Request, res: Response): Promise<void> {
    const body = req.body as VapiWebhookBody;
    const toolCalls = Array.isArray(body.message?.toolCallList)
        ? body.message.toolCallList
        : Array.isArray(body.message?.toolCalls)
          ? body.message.toolCalls
          : [];
    const results: { toolCallId: string; result: unknown }[] = [];

    for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id ?? toolCall.toolCallId ?? crypto.randomUUID();
        const name = toolCall.function?.name ?? toolCall.name ?? "";
        const rawArguments = toolCall.function?.arguments ?? toolCall.arguments ?? toolCall.parameters ?? {};
        let args: Record<string, unknown> = {};

        try {
            if (typeof rawArguments === "string") {
                args = JSON.parse(rawArguments) as Record<string, unknown>;
            } else if (rawArguments && typeof rawArguments === "object") {
                args = rawArguments as Record<string, unknown>;
            }

            const clientId = process.env.SPOTIFY_CLIENT_ID;
            const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
            const refreshToken = process.env.SPOTIFY_PHONE_REFRESH_TOKEN;
            const deviceId = process.env.SPOTIFY_PHONE_DEVICE_ID;
            const playlistUri = process.env.SPOTIFY_PHONE_DEFAULT_PLAYLIST_URI;

            if (!clientId || !clientSecret || !refreshToken || !deviceId) {
                throw new Error(
                    "Missing Spotify env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_PHONE_REFRESH_TOKEN, and SPOTIFY_PHONE_DEVICE_ID are required."
                );
            }

            if (name === "play_playlist" && !playlistUri) {
                throw new Error("Missing SPOTIFY_PHONE_DEFAULT_PLAYLIST_URI.");
            }

            if (name !== "play_playlist" && name !== "play_radio" && name !== "queue_song") {
                throw new Error(`Unsupported phone-radio tool: ${name || "(missing)"}.`);
            }

            const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
                },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                }),
            });

            if (!tokenResponse.ok) {
                throw new Error(`Spotify token refresh failed: ${await tokenResponse.text()}`);
            }

            const tokenData = (await tokenResponse.json()) as { access_token?: string };
            if (!tokenData.access_token) {
                throw new Error("Spotify token refresh did not return an access token.");
            }

            if (name === "play_playlist") {
                const playResponse = await fetch(
                    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
                    {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${tokenData.access_token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ context_uri: playlistUri }),
                    }
                );

                if (!playResponse.ok && playResponse.status !== 204) {
                    throw new Error(`Spotify playlist playback failed: ${await playResponse.text()}`);
                }

                results.push({
                    toolCallId,
                    result: {
                        ok: true,
                        message: "Started the default playlist.",
                        playlistUri,
                    },
                });
                continue;
            }

            const songRef = typeof args.songRef === "string" ? args.songRef.trim() : "";
            if (!songRef) {
                throw new Error("Missing songRef.");
            }

            const searchResponse = await fetch(
                `https://api.spotify.com/v1/search?${new URLSearchParams({
                    type: "track",
                    limit: "1",
                    q: songRef,
                }).toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${tokenData.access_token}`,
                    },
                }
            );

            if (!searchResponse.ok) {
                throw new Error(`Spotify track search failed: ${await searchResponse.text()}`);
            }

            const searchData = (await searchResponse.json()) as SpotifySearchResponse;
            const track = searchData.tracks?.items?.[0];
            if (!track) {
                throw new Error(`No Spotify track found for "${songRef}".`);
            }

            if (name === "play_radio") {
                const playResponse = await fetch(
                    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
                    {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${tokenData.access_token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ uris: [track.uri] }),
                    }
                );

                if (!playResponse.ok && playResponse.status !== 204) {
                    throw new Error(`Spotify radio playback failed: ${await playResponse.text()}`);
                }
            } else {
                const queueResponse = await fetch(
                    `https://api.spotify.com/v1/me/player/queue?${new URLSearchParams({
                        uri: track.uri,
                        device_id: deviceId,
                    }).toString()}`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${tokenData.access_token}`,
                        },
                    }
                );

                if (!queueResponse.ok && queueResponse.status !== 204) {
                    throw new Error(`Spotify queue failed: ${await queueResponse.text()}`);
                }
            }

            const artistNames = track.artists.map((artist) => artist.name);
            results.push({
                toolCallId,
                result: {
                    ok: true,
                    message:
                        name === "play_radio"
                            ? `Started ${track.name} by ${artistNames.join(", ")}.`
                            : `Queued ${track.name} by ${artistNames.join(", ")}.`,
                    track: {
                        id: track.id,
                        uri: track.uri,
                        name: track.name,
                        artists: artistNames,
                    },
                },
            });
        } catch (error) {
            results.push({
                toolCallId,
                result: {
                    ok: false,
                    message: error instanceof Error ? error.message : "Phone radio request failed.",
                },
            });
        }
    }

    res.json({ results });
}

const app = express();
const port = parseInt(process.env.PHONE_RADIO_PORT ?? "3010", 10);

app.use(express.json());
app.post("/vapi", phoneRadio);

app.listen(port, () => {
    console.log(`Phone radio server listening on http://localhost:${port}`);
});
