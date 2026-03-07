import "dotenv/config";

/**
 * Read a required environment variable, throwing a descriptive error if it is missing.
 * @param name  The env-var name (e.g. "LASTFM_API_KEY").
 * @param hint  Optional extra guidance appended to the error message.
 */
export function requireEnv(name: string, hint?: string): string {
    const value = process.env[name];
    if (!value) {
        const message = `${name} is not set. Add it to your .env file.`;
        throw new Error(hint ? `${message}\n${hint}` : message);
    }
    return value;
}

export interface LastfmConfig {
    apiKey: string;
    username: string;
}

export function loadLastfmConfig(): LastfmConfig {
    const apiKey = requireEnv(
        "LASTFM_API_KEY",
        "Get an API key at https://www.last.fm/api/account/create",
    );
    const username = requireEnv(
        "LASTFM_USERNAME",
        "This should be the Last.fm username whose history you want to export.",
    );

    return { apiKey, username };
}

export interface SpotifyConfig {
    clientId: string;
    clientSecret: string;
    redirectPort: number;
}

export function loadSpotifyConfig(): SpotifyConfig {
    const clientId = requireEnv(
        "SPOTIFY_CLIENT_ID",
        "Create a Spotify app at https://developer.spotify.com/dashboard",
    );
    const clientSecret = requireEnv(
        "SPOTIFY_CLIENT_SECRET",
        "Find it in your Spotify app settings at https://developer.spotify.com/dashboard",
    );
    const redirectPort = parseInt(
        process.env.SPOTIFY_REDIRECT_PORT ?? "3001",
        10,
    );

    return { clientId, clientSecret, redirectPort };
}
