import { loadLastfmConfig, type LastfmConfig } from "../config.js";

const LASTFM_API_BASE = "https://ws.audioscrobbler.com/2.0/";

export interface LastfmUserInfo {
    name: string;
    realname: string;
    playcount: string;
    registered: { unixtime: string };
    url: string;
}

export class LastfmClient {
    private readonly config: LastfmConfig;

    constructor(config?: LastfmConfig) {
        this.config = config ?? loadLastfmConfig();
    }

    /**
     * Make an authenticated request to the Last.fm API.
     * The API key is automatically included as a query parameter.
     */
    async request<T>(
        method: string,
        params: Record<string, string> = {},
    ): Promise<T> {
        const url = new URL(LASTFM_API_BASE);
        url.searchParams.set("method", method);
        url.searchParams.set("api_key", this.config.apiKey);
        url.searchParams.set("format", "json");
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }

        const response = await fetch(url);

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Last.fm API error (${response.status}): ${body}`);
        }

        const data = (await response.json()) as T & {
            error?: number;
            message?: string;
        };

        if (data.error) {
            throw new Error(`Last.fm API error ${data.error}: ${data.message}`);
        }

        return data;
    }

    /** Get the authenticated user's username (from config). */
    get username(): string {
        return this.config.username;
    }

    /**
     * Verify the API key and username by calling user.getInfo.
     * Returns the user info on success, throws on failure.
     */
    async verifyAuth(): Promise<LastfmUserInfo> {
        const data = await this.request<{ user: LastfmUserInfo }>(
            "user.getInfo",
            { user: this.config.username },
        );
        return data.user;
    }
}
