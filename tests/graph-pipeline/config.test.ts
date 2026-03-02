import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadLastfmConfig } from "../../graph-pipeline/src/config.js";

describe("loadLastfmConfig", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("returns config when both env vars are set", () => {
        process.env.LASTFM_API_KEY = "test-key";
        process.env.LASTFM_USERNAME = "test-user";

        const config = loadLastfmConfig();
        expect(config).toEqual({
            apiKey: "test-key",
            username: "test-user",
        });
    });

    it("throws when LASTFM_API_KEY is missing", () => {
        delete process.env.LASTFM_API_KEY;
        process.env.LASTFM_USERNAME = "test-user";

        expect(() => loadLastfmConfig()).toThrow("LASTFM_API_KEY is not set");
    });

    it("throws when LASTFM_USERNAME is missing", () => {
        process.env.LASTFM_API_KEY = "test-key";
        delete process.env.LASTFM_USERNAME;

        expect(() => loadLastfmConfig()).toThrow("LASTFM_USERNAME is not set");
    });
});
