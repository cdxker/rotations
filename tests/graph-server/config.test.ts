import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireEnv } from "../../graph-server/src/config.js";

describe("requireEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("returns the value when the env var is set", () => {
        process.env.TEST_VAR = "hello";
        expect(requireEnv("TEST_VAR")).toBe("hello");
    });

    it("throws when the env var is missing", () => {
        delete process.env.TEST_VAR;
        expect(() => requireEnv("TEST_VAR")).toThrow("TEST_VAR is not set");
    });

    it("includes hint in error message when provided", () => {
        delete process.env.TEST_VAR;
        expect(() => requireEnv("TEST_VAR", "Set it up")).toThrow("Set it up");
    });
});
