import { describe, it, expect, vi, beforeEach } from "vitest";
import { LastfmClient } from "./lastfm-client.js";

const TEST_CONFIG = { apiKey: "test-key", username: "test-user" };

describe("LastfmClient", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("constructs with explicit config", () => {
        const client = new LastfmClient(TEST_CONFIG);
        expect(client.username).toBe("test-user");
    });

    it("includes api_key, method, and format in requests", async () => {
        const mockResponse = { user: { name: "test-user" } };
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(mockResponse), { status: 200 }),
        );

        const client = new LastfmClient(TEST_CONFIG);
        await client.request("user.getInfo", { user: "test-user" });

        const calledUrl = new URL(
            (vi.mocked(fetch).mock.calls[0]![0] as URL).toString(),
        );
        expect(calledUrl.searchParams.get("method")).toBe("user.getInfo");
        expect(calledUrl.searchParams.get("api_key")).toBe("test-key");
        expect(calledUrl.searchParams.get("format")).toBe("json");
        expect(calledUrl.searchParams.get("user")).toBe("test-user");
    });

    it("throws on HTTP error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("Forbidden", { status: 403 }),
        );

        const client = new LastfmClient(TEST_CONFIG);
        await expect(client.request("user.getInfo")).rejects.toThrow(
            "Last.fm API error (403)",
        );
    });

    it("throws on Last.fm API-level error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({ error: 10, message: "Invalid API key" }),
                { status: 200 },
            ),
        );

        const client = new LastfmClient(TEST_CONFIG);
        await expect(client.request("user.getInfo")).rejects.toThrow(
            "Invalid API key",
        );
    });

    it("verifyAuth returns user info", async () => {
        const userInfo = {
            name: "test-user",
            realname: "Test User",
            playcount: "12345",
            registered: { unixtime: "1234567890" },
            url: "https://www.last.fm/user/test-user",
        };
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ user: userInfo }), { status: 200 }),
        );

        const client = new LastfmClient(TEST_CONFIG);
        const result = await client.verifyAuth();
        expect(result).toEqual(userInfo);
    });
});
