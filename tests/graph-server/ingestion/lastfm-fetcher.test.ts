import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LastfmClient } from "../../../graph-server/src/ingestion/lastfm-client.js";
import { fetchLastfmScrobbles } from "../../../graph-server/src/ingestion/lastfm-fetcher.js";
import type { RawScrobble } from "../../../graph-server/src/graph/build-graph.js";

const TEST_CONFIG = { apiKey: "test-key", username: "test-user" };

function makeApiTrack(
    artist: string,
    track: string,
    album: string,
    uts: string,
    mbid?: string,
) {
    return {
        artist: { "#text": artist },
        name: track,
        album: { "#text": album },
        date: { uts },
        ...(mbid ? { mbid } : {}),
    };
}

function makeApiResponse(
    tracks: ReturnType<typeof makeApiTrack>[],
    page: number,
    totalPages: number,
    total: number,
) {
    return {
        recenttracks: {
            track: tracks,
            "@attr": {
                page: String(page),
                totalPages: String(totalPages),
                total: String(total),
                user: "test-user",
            },
        },
    };
}

describe("fetchLastfmScrobbles", () => {
    let tmpDir: string;
    let client: LastfmClient;
    const logs: string[] = [];

    beforeEach(async () => {
        vi.restoreAllMocks();
        logs.length = 0;
        tmpDir = path.join(os.tmpdir(), `lastfm-test-${Date.now()}`);
        await mkdir(tmpDir, { recursive: true });
        client = new LastfmClient(TEST_CONFIG);
    });

    afterEach(async () => {
        if (existsSync(tmpDir)) {
            await rm(tmpDir, { recursive: true });
        }
    });

    it("fetches a single page of scrobbles", async () => {
        const tracks = [
            makeApiTrack("Artist A", "Track 1", "Album 1", "1000"),
            makeApiTrack("Artist B", "Track 2", "Album 2", "2000"),
        ];

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse(tracks, 1, 1, 2))),
        );

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            artist: "Artist A",
            track: "Track 1",
            album: "Album 1",
            timestamp: 1000,
        });
        expect(result[1]).toEqual({
            artist: "Artist B",
            track: "Track 2",
            album: "Album 2",
            timestamp: 2000,
        });

        // Verify file was written
        const saved: RawScrobble[] = JSON.parse(
            await readFile(path.join(tmpDir, "lastfm-scrobbles-test-user.json"), "utf-8"),
        );
        expect(saved).toHaveLength(2);
    });

    it("captures mbid when present", async () => {
        const tracks = [
            makeApiTrack("Artist A", "Track 1", "Album 1", "1000", "abc-123-def"),
            makeApiTrack("Artist B", "Track 2", "Album 2", "2000"),
            makeApiTrack("Artist C", "Track 3", "Album 3", "3000", ""),
        ];

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse(tracks, 1, 1, 3))),
        );

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result).toHaveLength(3);
        expect(result[0]!.mbid).toBe("abc-123-def");
        expect(result[1]!.mbid).toBeUndefined();
        expect(result[2]!.mbid).toBeUndefined(); // empty string → undefined
    });

    it("paginates through multiple pages", async () => {
        const page1Tracks = [
            makeApiTrack("Artist A", "Track 1", "Album 1", "1000"),
        ];
        const page2Tracks = [
            makeApiTrack("Artist B", "Track 2", "Album 2", "2000"),
        ];

        let callCount = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return new Response(
                    JSON.stringify(makeApiResponse(page1Tracks, 1, 2, 2)),
                );
            }
            return new Response(
                JSON.stringify(makeApiResponse(page2Tracks, 2, 2, 2)),
            );
        });

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result).toHaveLength(2);
        expect(callCount).toBe(2);
        expect(logs.some((l) => l.includes("Page 1/2"))).toBe(true);
        expect(logs.some((l) => l.includes("Page 2/2"))).toBe(true);
    });

    it("skips now-playing tracks", async () => {
        const tracks = [
            {
                artist: { "#text": "Artist A" },
                name: "Now Playing",
                album: { "#text": "Album" },
                "@attr": { nowplaying: "true" },
            },
            makeApiTrack("Artist B", "Track 2", "Album 2", "2000"),
        ];

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify(
                    makeApiResponse(
                        tracks as ReturnType<typeof makeApiTrack>[],
                        1,
                        1,
                        2,
                    ),
                ),
            ),
        );

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result).toHaveLength(1);
        expect(result[0]!.track).toBe("Track 2");
    });

    it("deduplicates scrobbles with same artist+track+timestamp", async () => {
        const tracks = [
            makeApiTrack("Artist A", "Track 1", "Album 1", "1000"),
            makeApiTrack("Artist A", "Track 1", "Album 1", "1000"),
            makeApiTrack("Artist A", "Track 1", "Album 1", "2000"),
        ];

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse(tracks, 1, 1, 3))),
        );

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result).toHaveLength(2);
    });

    it("skips tracks with missing artist or name", async () => {
        const tracks = [
            makeApiTrack("", "Track 1", "Album 1", "1000"),
            makeApiTrack("Artist B", "", "Album 2", "2000"),
            makeApiTrack("Artist C", "Track 3", "Album 3", "3000"),
        ];

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse(tracks, 1, 1, 3))),
        );

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result).toHaveLength(1);
        expect(result[0]!.track).toBe("Track 3");
    });

    it("handles empty scrobble history", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse([], 1, 0, 0))),
        );

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result).toHaveLength(0);
        expect(logs.some((l) => l.includes("No scrobbles found"))).toBe(true);
    });

    it("sorts scrobbles chronologically", async () => {
        const tracks = [
            makeApiTrack("Artist C", "Track 3", "Album 3", "3000"),
            makeApiTrack("Artist A", "Track 1", "Album 1", "1000"),
            makeApiTrack("Artist B", "Track 2", "Album 2", "2000"),
        ];

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse(tracks, 1, 1, 3))),
        );

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        expect(result[0]!.timestamp).toBe(1000);
        expect(result[1]!.timestamp).toBe(2000);
        expect(result[2]!.timestamp).toBe(3000);
    });

    it("saves and resumes from checkpoint", async () => {
        // First fetch
        const tracks1 = [
            makeApiTrack("Artist A", "Track 1", "Album 1", "1000"),
        ];

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse(tracks1, 1, 1, 1))),
        );

        await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        // Verify checkpoint was saved
        expect(existsSync(path.join(tmpDir, "lastfm-checkpoint-test-user.json"))).toBe(
            true,
        );

        // Second fetch (resume) — new tracks since checkpoint
        vi.restoreAllMocks();
        const tracks2 = [
            makeApiTrack("Artist B", "Track 2", "Album 2", "2000"),
        ];

        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = new URL((input as URL).toString());
            // Verify the "from" param is set for resume
            expect(url.searchParams.get("from")).toBe("1000");
            return new Response(
                JSON.stringify(makeApiResponse(tracks2, 1, 1, 1)),
            );
        });

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
        });

        // Should have both old and new tracks
        expect(result).toHaveLength(2);
        expect(result[0]!.track).toBe("Track 1");
        expect(result[1]!.track).toBe("Track 2");
        expect(logs.some((l) => l.includes("Resuming from checkpoint"))).toBe(
            true,
        );
    });

    it("handles >65k scrobbles without RangeError in checkpoint", async () => {
        // Return all 70k tracks on a single page to avoid sleep delays,
        // then verify no RangeError from the final checkpoint Math.max replacement
        const TOTAL = 70_000;
        const tracks = [];
        for (let i = 0; i < TOTAL; i++) {
            tracks.push(
                makeApiTrack("Artist", `Track ${i}`, "Album", String(1000 + i)),
            );
        }

        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(makeApiResponse(tracks, 1, 1, TOTAL))),
        );

        // Should not throw RangeError: Maximum call stack size exceeded
        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: () => {},
        });

        expect(result.length).toBe(TOTAL);
    }, 30_000);

    it("fullRefresh ignores checkpoint", async () => {
        // Create a fake checkpoint
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
            path.join(tmpDir, "lastfm-checkpoint-test-user.json"),
            JSON.stringify({
                lastTimestamp: 1000,
                scrobbleCount: 1,
                fetchedAt: new Date().toISOString(),
            }),
        );

        const tracks = [makeApiTrack("Artist A", "Track 1", "Album 1", "500")];

        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = new URL((input as URL).toString());
            // Should NOT have "from" param when fullRefresh
            expect(url.searchParams.has("from")).toBe(false);
            return new Response(
                JSON.stringify(makeApiResponse(tracks, 1, 1, 1)),
            );
        });

        const result = await fetchLastfmScrobbles(client, {
            username: "test-user",
            dataDir: tmpDir,
            onProgress: (msg) => logs.push(msg),
            fullRefresh: true,
        });

        expect(result).toHaveLength(1);
    });
});
