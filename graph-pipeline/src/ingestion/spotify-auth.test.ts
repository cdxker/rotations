import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpotifyAuth, type SpotifyTokens } from "./spotify-auth.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

const TEST_CONFIG = {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectPort: 9999,
};

function makeTokens(overrides?: Partial<SpotifyTokens>): SpotifyTokens {
    return {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: Date.now() + 3600_000,
        scope: "user-read-recently-played playlist-read-private playlist-read-collaborative",
        ...overrides,
    };
}

describe("SpotifyAuth", () => {
    let tmpDir: string;
    let tokenPath: string;

    beforeEach(() => {
        vi.restoreAllMocks();
        tmpDir = mkdtempSync(join(tmpdir(), "spotify-auth-test-"));
        tokenPath = join(tmpDir, ".spotify-tokens.json");
    });

    function createAuth() {
        return new SpotifyAuth({ config: TEST_CONFIG, tokenPath });
    }

    describe("buildAuthUrl", () => {
        it("includes required scopes, client ID, and state", () => {
            const auth = createAuth();
            const url = new URL(auth.buildAuthUrl("test-state"));

            expect(url.origin).toBe("https://accounts.spotify.com");
            expect(url.pathname).toBe("/authorize");
            expect(url.searchParams.get("response_type")).toBe("code");
            expect(url.searchParams.get("client_id")).toBe("test-client-id");
            expect(url.searchParams.get("state")).toBe("test-state");

            const scopes = url.searchParams.get("scope")!.split(" ");
            expect(scopes).toContain("user-read-recently-played");
            expect(scopes).toContain("playlist-read-private");
            expect(scopes).toContain("playlist-read-collaborative");
        });

        it("uses configured redirect port", () => {
            const auth = createAuth();
            const url = new URL(auth.buildAuthUrl("state"));
            expect(url.searchParams.get("redirect_uri")).toBe(
                "http://localhost:9999/callback",
            );
        });
    });

    describe("token persistence", () => {
        it("saveTokens writes to disk and loadTokens reads them back", async () => {
            const auth = createAuth();
            const tokens = makeTokens();

            await auth.saveTokens(tokens);

            const raw = await readFile(tokenPath, "utf-8");
            const saved = JSON.parse(raw);
            expect(saved.access_token).toBe("test-access-token");
            expect(saved.refresh_token).toBe("test-refresh-token");

            const loaded = await auth.loadTokens();
            expect(loaded).toEqual(tokens);
        });

        it("loadTokens returns null when file does not exist", async () => {
            const auth = createAuth();
            const loaded = await auth.loadTokens();
            expect(loaded).toBeNull();
        });

        it("hasTokens returns true when tokens exist", async () => {
            const auth = createAuth();
            await auth.saveTokens(makeTokens());
            expect(await auth.hasTokens()).toBe(true);
        });

        it("hasTokens returns false when no tokens", async () => {
            const auth = createAuth();
            expect(await auth.hasTokens()).toBe(false);
        });
    });

    describe("exchangeCode", () => {
        it("sends correct request to Spotify token endpoint", async () => {
            const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
                new Response(
                    JSON.stringify({
                        access_token: "new-access",
                        refresh_token: "new-refresh",
                        expires_in: 3600,
                        scope: "user-read-recently-played",
                    }),
                    { status: 200 },
                ),
            );

            const auth = createAuth();
            const tokens = await auth.exchangeCode("test-code");

            expect(tokens.access_token).toBe("new-access");
            expect(tokens.refresh_token).toBe("new-refresh");
            expect(tokens.expires_at).toBeGreaterThan(Date.now());

            const [url, opts] = mockFetch.mock.calls[0]!;
            expect(url).toBe("https://accounts.spotify.com/api/token");
            expect(opts?.method).toBe("POST");

            const body = opts?.body as URLSearchParams;
            expect(body.get("grant_type")).toBe("authorization_code");
            expect(body.get("code")).toBe("test-code");
        });

        it("throws on failed token exchange", async () => {
            vi.spyOn(globalThis, "fetch").mockResolvedValue(
                new Response("Bad Request", { status: 400 }),
            );

            const auth = createAuth();
            await expect(auth.exchangeCode("bad-code")).rejects.toThrow(
                "Spotify token exchange failed (400)",
            );
        });
    });

    describe("refreshAccessToken", () => {
        it("refreshes and saves new tokens", async () => {
            vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
                new Response(
                    JSON.stringify({
                        access_token: "refreshed-access",
                        expires_in: 3600,
                        scope: "user-read-recently-played",
                    }),
                    { status: 200 },
                ),
            );

            const auth = createAuth();
            // Seed with expired tokens on disk
            await auth.saveTokens(makeTokens({ expires_at: Date.now() - 1000 }));

            // getAccessToken should load expired tokens, then refresh
            const token = await auth.getAccessToken();

            expect(token).toBe("refreshed-access");

            // Verify tokens were persisted
            const saved = await auth.loadTokens();
            expect(saved?.access_token).toBe("refreshed-access");
            // Should keep old refresh token when new one isn't provided
            expect(saved?.refresh_token).toBe("test-refresh-token");
        });

        it("uses new refresh token when provided by Spotify", async () => {
            vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
                new Response(
                    JSON.stringify({
                        access_token: "refreshed-access",
                        refresh_token: "new-refresh-token",
                        expires_in: 3600,
                        scope: "user-read-recently-played",
                    }),
                    { status: 200 },
                ),
            );

            const auth = createAuth();
            await auth.saveTokens(makeTokens({ expires_at: Date.now() - 1000 }));

            const token = await auth.getAccessToken();
            expect(token).toBe("refreshed-access");

            const saved = await auth.loadTokens();
            expect(saved?.refresh_token).toBe("new-refresh-token");
        });

        it("throws when no refresh token available", async () => {
            const auth = createAuth();
            await expect(auth.getAccessToken()).rejects.toThrow(
                "No Spotify tokens found",
            );
        });
    });

    describe("getAccessToken", () => {
        it("returns cached token when not expired", async () => {
            const auth = createAuth();
            await auth.saveTokens(makeTokens());

            const token = await auth.getAccessToken();
            expect(token).toBe("test-access-token");
        });

        it("refreshes when token is about to expire (within 60s)", async () => {
            vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
                new Response(
                    JSON.stringify({
                        access_token: "refreshed",
                        expires_in: 3600,
                        scope: "user-read-recently-played",
                    }),
                    { status: 200 },
                ),
            );

            const auth = createAuth();
            // Token expires in 30 seconds (within the 60s buffer)
            await auth.saveTokens(makeTokens({ expires_at: Date.now() + 30_000 }));

            const token = await auth.getAccessToken();
            expect(token).toBe("refreshed");
        });
    });
});

describe("loadSpotifyConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("returns config when env vars are set", async () => {
        process.env.SPOTIFY_CLIENT_ID = "test-id";
        process.env.SPOTIFY_CLIENT_SECRET = "test-secret";

        const { loadSpotifyConfig } = await import("../config.js");
        const config = loadSpotifyConfig();
        expect(config).toEqual({
            clientId: "test-id",
            clientSecret: "test-secret",
            redirectPort: 8888,
        });
    });

    it("throws when SPOTIFY_CLIENT_ID is missing", async () => {
        delete process.env.SPOTIFY_CLIENT_ID;
        process.env.SPOTIFY_CLIENT_SECRET = "test-secret";

        const { loadSpotifyConfig } = await import("../config.js");
        expect(() => loadSpotifyConfig()).toThrow("SPOTIFY_CLIENT_ID is not set");
    });

    it("throws when SPOTIFY_CLIENT_SECRET is missing", async () => {
        process.env.SPOTIFY_CLIENT_ID = "test-id";
        delete process.env.SPOTIFY_CLIENT_SECRET;

        const { loadSpotifyConfig } = await import("../config.js");
        expect(() => loadSpotifyConfig()).toThrow("SPOTIFY_CLIENT_SECRET is not set");
    });
});
