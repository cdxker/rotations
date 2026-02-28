import "dotenv/config";

export interface LastfmConfig {
    apiKey: string;
    username: string;
}

export function loadLastfmConfig(): LastfmConfig {
    const apiKey = process.env.LASTFM_API_KEY;
    const username = process.env.LASTFM_USERNAME;

    if (!apiKey) {
        throw new Error(
            "LASTFM_API_KEY is not set. Add it to your .env file.\n" +
                "Get an API key at https://www.last.fm/api/account/create",
        );
    }

    if (!username) {
        throw new Error(
            "LASTFM_USERNAME is not set. Add it to your .env file.\n" +
                "This should be the Last.fm username whose history you want to export.",
        );
    }

    return { apiKey, username };
}

export interface SpotifyConfig {
    clientId: string;
    clientSecret: string;
    redirectPort: number;
}

export function loadSpotifyConfig(): SpotifyConfig {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectPort = parseInt(process.env.SPOTIFY_REDIRECT_PORT ?? "8888", 10);

    if (!clientId) {
        throw new Error(
            "SPOTIFY_CLIENT_ID is not set. Add it to your .env file.\n" +
                "Create a Spotify app at https://developer.spotify.com/dashboard",
        );
    }

    if (!clientSecret) {
        throw new Error(
            "SPOTIFY_CLIENT_SECRET is not set. Add it to your .env file.\n" +
                "Find it in your Spotify app settings at https://developer.spotify.com/dashboard",
        );
    }

    return { clientId, clientSecret, redirectPort };
}
