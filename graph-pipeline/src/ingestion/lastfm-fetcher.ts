import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { LastfmClient } from "./lastfm-client.js";
import type { RawScrobble } from "../graph/build-graph.js";

const TRACKS_PER_PAGE = 200;
const RATE_LIMIT_MS = 1000;
const DATA_DIR = path.join(import.meta.dirname, "../../data");

/** Shape of a single track from the Last.fm API response. */
interface LastfmApiTrack {
    artist: { "#text": string };
    name: string;
    album: { "#text": string };
    image?: Array<{ "#text": string; size: string }>;
    date?: { uts: string };
    "@attr"?: { nowplaying: string };
}

/** Shape of the user.getRecentTracks API response. */
interface RecentTracksResponse {
    recenttracks: {
        track: LastfmApiTrack[];
        "@attr": {
            page: string;
            totalPages: string;
            total: string;
            user: string;
        };
    };
}

/** Checkpoint for resume support. */
interface FetchCheckpoint {
    lastTimestamp: number;
    scrobbleCount: number;
    fetchedAt: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTrack(track: LastfmApiTrack): RawScrobble | null {
    // Skip "now playing" tracks — they have no timestamp
    if (track["@attr"]?.nowplaying === "true") {
        return null;
    }

    // Skip tracks with missing essential fields
    if (!track.artist["#text"] || !track.name) {
        return null;
    }

    const timestamp = track.date ? parseInt(track.date.uts, 10) : 0;
    if (timestamp === 0) {
        return null;
    }

    // Pick the best available image (prefer "extralarge" or "large")
    let imageUrl: string | undefined;
    if (track.image?.length) {
        const large =
            track.image.find((img) => img.size === "extralarge") ??
            track.image.find((img) => img.size === "large");
        const url = (large ?? track.image[track.image.length - 1])?.["#text"];
        if (url) imageUrl = url;
    }

    return {
        artist: track.artist["#text"],
        track: track.name,
        album: track.album["#text"] ?? "",
        timestamp,
        imageUrl,
    };
}

function deduplicateScrobbles(scrobbles: RawScrobble[]): RawScrobble[] {
    const seen = new Set<string>();
    return scrobbles.filter((s) => {
        const key = `${s.artist}::${s.track}::${s.timestamp}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export interface FetchOptions {
    /** Override data output directory (for testing). */
    dataDir?: string;
    /** Callback for progress updates. Defaults to console.log. */
    onProgress?: (message: string) => void;
    /** If true, ignore checkpoint and fetch everything. */
    fullRefresh?: boolean;
}

/**
 * Fetch the full scrobble history from Last.fm and save as JSON.
 * Supports resuming from a checkpoint if interrupted.
 */
export async function fetchLastfmScrobbles(
    client: LastfmClient,
    options: FetchOptions = {},
): Promise<RawScrobble[]> {
    const dataDir = options.dataDir ?? DATA_DIR;
    const log = options.onProgress ?? console.log;
    const outputPath = path.join(dataDir, "lastfm-scrobbles.json");
    const checkpointPath = path.join(dataDir, "lastfm-checkpoint.json");

    await mkdir(dataDir, { recursive: true });

    // Check for existing checkpoint (resume support)
    let fromTimestamp = 0;
    let existingScrobbles: RawScrobble[] = [];

    if (!options.fullRefresh && existsSync(checkpointPath)) {
        const checkpoint: FetchCheckpoint = JSON.parse(
            await readFile(checkpointPath, "utf-8"),
        );
        fromTimestamp = checkpoint.lastTimestamp;

        if (existsSync(outputPath)) {
            existingScrobbles = JSON.parse(await readFile(outputPath, "utf-8"));
        }

        log(
            `Resuming from checkpoint: ${checkpoint.scrobbleCount} scrobbles already fetched, ` +
                `picking up from ${new Date(fromTimestamp * 1000).toISOString()}`,
        );
    }

    // First request to get total pages
    const firstPage = await client.request<RecentTracksResponse>(
        "user.getRecentTracks",
        {
            user: client.username,
            limit: String(TRACKS_PER_PAGE),
            page: "1",
            ...(fromTimestamp > 0 ? { from: String(fromTimestamp) } : {}),
        },
    );

    const totalPages = parseInt(firstPage.recenttracks["@attr"].totalPages, 10);
    const totalTracks = parseInt(firstPage.recenttracks["@attr"].total, 10);

    if (totalPages === 0 || totalTracks === 0) {
        log("No scrobbles found.");
        const result = existingScrobbles;
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        return result;
    }

    log(
        `Found ${totalTracks} scrobbles across ${totalPages} pages` +
            (fromTimestamp > 0 ? " (since last checkpoint)" : ""),
    );

    // Parse first page
    const newScrobbles: RawScrobble[] = [];
    for (const track of firstPage.recenttracks.track) {
        const parsed = parseTrack(track);
        if (parsed) newScrobbles.push(parsed);
    }

    log(`Page 1/${totalPages} — ${newScrobbles.length} tracks`);

    // Fetch remaining pages
    for (let page = 2; page <= totalPages; page++) {
        await sleep(RATE_LIMIT_MS);

        const response = await client.request<RecentTracksResponse>(
            "user.getRecentTracks",
            {
                user: client.username,
                limit: String(TRACKS_PER_PAGE),
                page: String(page),
                ...(fromTimestamp > 0 ? { from: String(fromTimestamp) } : {}),
            },
        );

        for (const track of response.recenttracks.track) {
            const parsed = parseTrack(track);
            if (parsed) newScrobbles.push(parsed);
        }

        log(`Page ${page}/${totalPages} — ${newScrobbles.length} tracks total`);

        // Save checkpoint every 10 pages
        if (page % 10 === 0) {
            let latestTimestamp = 0;
            for (const s of newScrobbles) {
                if (s.timestamp > latestTimestamp)
                    latestTimestamp = s.timestamp;
            }
            const checkpoint: FetchCheckpoint = {
                lastTimestamp: latestTimestamp,
                scrobbleCount: existingScrobbles.length + newScrobbles.length,
                fetchedAt: new Date().toISOString(),
            };
            await writeFile(
                checkpointPath,
                JSON.stringify(checkpoint, null, 2),
            );
        }
    }

    // Merge with existing scrobbles and deduplicate
    const allScrobbles = deduplicateScrobbles([
        ...existingScrobbles,
        ...newScrobbles,
    ]);

    // Sort by timestamp (chronological order)
    allScrobbles.sort((a, b) => a.timestamp - b.timestamp);

    // Save final output
    await writeFile(outputPath, JSON.stringify(allScrobbles, null, 2));

    // Save final checkpoint
    const latestTimestamp =
        allScrobbles.length > 0
            ? allScrobbles[allScrobbles.length - 1]!.timestamp
            : 0;
    const checkpoint: FetchCheckpoint = {
        lastTimestamp: latestTimestamp,
        scrobbleCount: allScrobbles.length,
        fetchedAt: new Date().toISOString(),
    };
    await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

    log(`Done! ${allScrobbles.length} scrobbles saved to ${outputPath}`);

    return allScrobbles;
}
