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
