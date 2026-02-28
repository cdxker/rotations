import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { loadSpotifyConfig, type SpotifyConfig } from "../config.js";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

const REQUIRED_SCOPES = [
    "user-read-recently-played",
    "playlist-read-private",
    "playlist-read-collaborative",
] as const;

export interface SpotifyTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    scope: string;
}

const DEFAULT_TOKEN_PATH = resolve(
    process.cwd(),
    "graph-pipeline",
    ".spotify-tokens.json",
);

export class SpotifyAuth {
    private readonly config: SpotifyConfig;
    private readonly tokenPath: string;
    private tokens: SpotifyTokens | null = null;

    constructor(opts?: { config?: SpotifyConfig; tokenPath?: string }) {
        this.config = opts?.config ?? loadSpotifyConfig();
        this.tokenPath = opts?.tokenPath ?? DEFAULT_TOKEN_PATH;
    }

    private get redirectUri(): string {
        return `http://localhost:${this.config.redirectPort}/callback`;
    }

    /**
     * Get a valid access token. Loads from disk, refreshes if expired,
     * or initiates a new auth flow if no tokens exist.
     */
    async getAccessToken(): Promise<string> {
        if (!this.tokens) {
            this.tokens = await this.loadTokens();
        }

        if (!this.tokens) {
            throw new Error(
                "No Spotify tokens found. Run the auth flow first with authorize().",
            );
        }

        // Refresh if token expires within 60 seconds
        if (Date.now() >= this.tokens.expires_at - 60_000) {
            await this.refreshAccessToken();
        }

        return this.tokens!.access_token;
    }

    /** Check if tokens exist on disk (user has previously authorized). */
    async hasTokens(): Promise<boolean> {
        try {
            const tokens = await this.loadTokens();
            return tokens !== null;
        } catch {
            return false;
        }
    }

    /**
     * Run the full OAuth authorization flow:
     * 1. Start a local HTTP server to catch the redirect
     * 2. Open the browser to the Spotify auth page
     * 3. Exchange the auth code for tokens
     * 4. Save tokens to disk
     *
     * Returns the auth URL for the caller to open (or prints it).
     */
    async authorize(): Promise<SpotifyTokens> {
        const state = randomBytes(16).toString("hex");
        const authUrl = this.buildAuthUrl(state);

        console.log("\nOpen this URL in your browser to authorize Spotify:\n");
        console.log(`  ${authUrl}\n`);

        // Try to open the browser automatically
        this.openBrowser(authUrl);

        const code = await this.waitForCallback(state);
        const tokens = await this.exchangeCode(code);
        this.tokens = tokens;
        await this.saveTokens(tokens);

        console.log("Spotify authorization successful! Tokens saved.\n");
        return tokens;
    }

    /** Build the Spotify authorization URL with required scopes. */
    buildAuthUrl(state: string): string {
        const params = new URLSearchParams({
            response_type: "code",
            client_id: this.config.clientId,
            scope: REQUIRED_SCOPES.join(" "),
            redirect_uri: this.redirectUri,
            state,
        });
        return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
    }

    /** Exchange an authorization code for access + refresh tokens. */
    async exchangeCode(code: string): Promise<SpotifyTokens> {
        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization:
                    "Basic " +
                    Buffer.from(
                        `${this.config.clientId}:${this.config.clientSecret}`,
                    ).toString("base64"),
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: this.redirectUri,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(
                `Spotify token exchange failed (${response.status}): ${body}`,
            );
        }

        const data = (await response.json()) as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
            scope: string;
        };

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + data.expires_in * 1000,
            scope: data.scope,
        };
    }

    /** Refresh the access token using the stored refresh token. */
    async refreshAccessToken(): Promise<void> {
        if (!this.tokens?.refresh_token) {
            throw new Error(
                "No refresh token available. Re-run the auth flow with authorize().",
            );
        }

        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization:
                    "Basic " +
                    Buffer.from(
                        `${this.config.clientId}:${this.config.clientSecret}`,
                    ).toString("base64"),
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: this.tokens.refresh_token,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(
                `Spotify token refresh failed (${response.status}): ${body}`,
            );
        }

        const data = (await response.json()) as {
            access_token: string;
            refresh_token?: string;
            expires_in: number;
            scope: string;
        };

        this.tokens = {
            access_token: data.access_token,
            // Spotify may return a new refresh token; keep the old one if not
            refresh_token: data.refresh_token ?? this.tokens.refresh_token,
            expires_at: Date.now() + data.expires_in * 1000,
            scope: data.scope,
        };

        await this.saveTokens(this.tokens);
    }

    /** Load tokens from disk. Returns null if file doesn't exist. */
    async loadTokens(): Promise<SpotifyTokens | null> {
        try {
            const raw = await readFile(this.tokenPath, "utf-8");
            return JSON.parse(raw) as SpotifyTokens;
        } catch (err: unknown) {
            if (
                err instanceof Error &&
                "code" in err &&
                (err as NodeJS.ErrnoException).code === "ENOENT"
            ) {
                return null;
            }
            throw err;
        }
    }

    /** Save tokens to disk. */
    async saveTokens(tokens: SpotifyTokens): Promise<void> {
        await mkdir(dirname(this.tokenPath), { recursive: true });
        await writeFile(this.tokenPath, JSON.stringify(tokens, null, 2));
    }

    /**
     * Start a temporary local HTTP server and wait for the OAuth callback.
     * Returns the authorization code from the callback.
     */
    private waitForCallback(expectedState: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            let server: Server;

            const timeout = setTimeout(() => {
                server?.close();
                reject(
                    new Error(
                        "OAuth callback timed out after 120 seconds. Please try again.",
                    ),
                );
            }, 120_000);

            server = createServer((req, res) => {
                const url = new URL(req.url ?? "/", `http://localhost:${this.config.redirectPort}`);

                if (url.pathname !== "/callback") {
                    res.writeHead(404);
                    res.end("Not found");
                    return;
                }

                const code = url.searchParams.get("code");
                const state = url.searchParams.get("state");
                const error = url.searchParams.get("error");

                if (error) {
                    res.writeHead(400);
                    res.end(`Authorization failed: ${error}`);
                    clearTimeout(timeout);
                    server.close();
                    reject(new Error(`Spotify authorization denied: ${error}`));
                    return;
                }

                if (state !== expectedState) {
                    res.writeHead(400);
                    res.end("State mismatch — possible CSRF. Please try again.");
                    clearTimeout(timeout);
                    server.close();
                    reject(new Error("OAuth state mismatch"));
                    return;
                }

                if (!code) {
                    res.writeHead(400);
                    res.end("Missing authorization code.");
                    clearTimeout(timeout);
                    server.close();
                    reject(new Error("Missing authorization code in callback"));
                    return;
                }

                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(
                    "<html><body><h1>Authorization successful!</h1>" +
                        "<p>You can close this tab and return to the terminal.</p></body></html>",
                );

                clearTimeout(timeout);
                server.close();
                resolve(code);
            });

            server.listen(this.config.redirectPort, () => {
                console.log(
                    `Listening for OAuth callback on http://localhost:${this.config.redirectPort}/callback`,
                );
            });

            server.on("error", (err) => {
                clearTimeout(timeout);
                reject(
                    new Error(
                        `Failed to start OAuth callback server: ${err.message}`,
                    ),
                );
            });
        });
    }

    /** Try to open the URL in the user's default browser. */
    private openBrowser(url: string): void {
        const { exec } = require("node:child_process") as typeof import("node:child_process");
        const command =
            process.platform === "darwin"
                ? `open "${url}"`
                : process.platform === "win32"
                  ? `start "${url}"`
                  : `xdg-open "${url}"`;

        exec(command, (err) => {
            if (err) {
                // Non-fatal — the user can manually open the URL
                console.log("(Could not open browser automatically. Please open the URL above manually.)");
            }
        });
    }
}
