import {
    type SongKey,
    type GraphNode,
    type ListeningGraph,
    type ListeningSource,
    toSongKey,
} from "./types.js";

/** A single scrobble from Last.fm's user.getRecentTracks API. */
export interface RawScrobble {
    artist: string;
    track: string;
    album: string;
    /** Unix timestamp (seconds) of when the track was scrobbled. */
    timestamp: number;
    /** Album artwork URL from Last.fm, if available. */
    imageUrl?: string;
}

/** A single track from Spotify's /v1/me/player/recently-played endpoint. */
export interface RawSpotifyRecentTrack {
    spotifyId: string;
    artist: string;
    track: string;
    album: string;
    /** ISO 8601 timestamp of when the track was played. */
    playedAt: string;
    /** Album artwork URL from Spotify, if available. */
    imageUrl?: string;
}

/** A single track from a Spotify playlist, with its position in that playlist. */
export interface RawSpotifyPlaylistTrack {
    spotifyId: string;
    artist: string;
    track: string;
    album: string;
    /** Name of the playlist this track belongs to. */
    playlistName: string;
    /** Zero-based position of this track within the playlist. */
    position: number;
    /** Album artwork URL from Spotify, if available. */
    imageUrl?: string;
}

/** Input data for the graph builder. All fields are optional — build with whatever sources are available. */
export interface GraphInput {
    lastfmScrobbles?: RawScrobble[];
    spotifyRecentTracks?: RawSpotifyRecentTrack[];
    spotifyPlaylistTracks?: RawSpotifyPlaylistTrack[];
    lastfmUsername?: string;
    spotifyUsername?: string;
}

function getOrCreateNode(
    nodes: Record<SongKey, GraphNode>,
    key: SongKey,
    name: string,
    artist: string,
    album: string,
    imageUrl?: string,
): GraphNode {
    let node = nodes[key];
    if (!node) {
        node = {
            name,
            artists: [artist],
            albumName: album || undefined,
            next: {} as Record<SongKey, number>,
            previous: {} as Record<SongKey, number>,
            totalPlays: 0,
            sources: [],
        };
        nodes[key] = node;
    }
    // Keep first non-empty image URL encountered
    if (imageUrl && !node.imageUrl) {
        node.imageUrl = imageUrl;
    }
    return node;
}

function addSource(node: GraphNode, source: ListeningSource): void {
    if (!node.sources.includes(source)) {
        node.sources.push(source);
    }
}

function addEdge(
    nodes: Record<SongKey, GraphNode>,
    fromKey: SongKey,
    toKey: SongKey,
): void {
    const fromNode = nodes[fromKey];
    const toNode = nodes[toKey];
    if (!fromNode || !toNode) return;

    fromNode.next[toKey] = (fromNode.next[toKey] ?? 0) + 1;
    toNode.previous[fromKey] = (toNode.previous[fromKey] ?? 0) + 1;
}

function isValidTrack(artist: string, track: string): boolean {
    return artist.trim().length > 0 && track.trim().length > 0;
}

function processLastfmScrobbles(
    nodes: Record<SongKey, GraphNode>,
    scrobbles: RawScrobble[],
): { totalPlays: number; timestamps: number[] } {
    // Sort chronologically
    const sorted = [...scrobbles].sort((a, b) => a.timestamp - b.timestamp);
    const timestamps: number[] = [];
    const keys: SongKey[] = [];

    for (const scrobble of sorted) {
        if (!isValidTrack(scrobble.artist, scrobble.track)) continue;

        const key = toSongKey(scrobble.artist, scrobble.track);
        const node = getOrCreateNode(
            nodes,
            key,
            scrobble.track,
            scrobble.artist,
            scrobble.album,
            scrobble.imageUrl,
        );
        node.totalPlays++;
        addSource(node, "lastfm");
        keys.push(key);
        timestamps.push(scrobble.timestamp);
    }

    // Create edges from consecutive pairs
    for (let i = 0; i < keys.length - 1; i++) {
        addEdge(nodes, keys[i]!, keys[i + 1]!);
    }

    return { totalPlays: keys.length, timestamps };
}

function processSpotifyRecentTracks(
    nodes: Record<SongKey, GraphNode>,
    tracks: RawSpotifyRecentTrack[],
): { totalPlays: number; timestamps: number[] } {
    // Sort chronologically by playedAt
    const sorted = [...tracks].sort(
        (a, b) =>
            new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime(),
    );
    const timestamps: number[] = [];
    const keys: SongKey[] = [];

    for (const track of sorted) {
        if (!isValidTrack(track.artist, track.track)) continue;

        const key = toSongKey(track.artist, track.track);
        const node = getOrCreateNode(
            nodes,
            key,
            track.track,
            track.artist,
            track.album,
            track.imageUrl,
        );
        node.totalPlays++;
        node.spotifyId = node.spotifyId ?? track.spotifyId;
        addSource(node, "spotify-recent");
        keys.push(key);
        timestamps.push(new Date(track.playedAt).getTime() / 1000);
    }

    // Create edges from consecutive pairs
    for (let i = 0; i < keys.length - 1; i++) {
        addEdge(nodes, keys[i]!, keys[i + 1]!);
    }

    return { totalPlays: keys.length, timestamps };
}

function processSpotifyPlaylists(
    nodes: Record<SongKey, GraphNode>,
    tracks: RawSpotifyPlaylistTrack[],
): number {
    // Group by playlist, sort by position within each
    const playlists = new Map<string, RawSpotifyPlaylistTrack[]>();
    for (const track of tracks) {
        const list = playlists.get(track.playlistName) ?? [];
        list.push(track);
        playlists.set(track.playlistName, list);
    }

    let totalPlays = 0;

    for (const [, playlistTracks] of playlists) {
        const sorted = playlistTracks.sort((a, b) => a.position - b.position);
        const keys: SongKey[] = [];

        for (const track of sorted) {
            if (!isValidTrack(track.artist, track.track)) continue;

            const key = toSongKey(track.artist, track.track);
            const node = getOrCreateNode(
                nodes,
                key,
                track.track,
                track.artist,
                track.album,
                track.imageUrl,
            );
            node.totalPlays++;
            node.spotifyId = node.spotifyId ?? track.spotifyId;
            addSource(node, "spotify-playlist");
            keys.push(key);
            totalPlays++;
        }

        // Create edges from consecutive tracks in playlist
        for (let i = 0; i < keys.length - 1; i++) {
            addEdge(nodes, keys[i]!, keys[i + 1]!);
        }
    }

    return totalPlays;
}

/**
 * Build a unified ListeningGraph from raw data sources.
 * Accepts any combination of Last.fm scrobbles, Spotify recent tracks,
 * and Spotify playlist tracks.
 */
export function buildGraph(input: GraphInput): ListeningGraph {
    const nodes: Record<SongKey, GraphNode> = {} as Record<SongKey, GraphNode>;
    const allTimestamps: number[] = [];
    let totalScrobbles = 0;

    // Process each source
    if (input.lastfmScrobbles?.length) {
        const result = processLastfmScrobbles(nodes, input.lastfmScrobbles);
        totalScrobbles += result.totalPlays;
        allTimestamps.push(...result.timestamps);
    }

    if (input.spotifyRecentTracks?.length) {
        const result = processSpotifyRecentTracks(
            nodes,
            input.spotifyRecentTracks,
        );
        totalScrobbles += result.totalPlays;
        allTimestamps.push(...result.timestamps);
    }

    if (input.spotifyPlaylistTracks?.length) {
        totalScrobbles += processSpotifyPlaylists(
            nodes,
            input.spotifyPlaylistTracks,
        );
    }

    // Compute date range from timestamps
    const from =
        allTimestamps.length > 0
            ? new Date(Math.min(...allTimestamps) * 1000).toISOString()
            : "";
    const to =
        allTimestamps.length > 0
            ? new Date(Math.max(...allTimestamps) * 1000).toISOString()
            : "";

    return {
        nodes,
        metadata: {
            totalScrobbles,
            dateRange: { from, to },
            exportTimestamp: new Date().toISOString(),
            lastfmUsername: input.lastfmUsername,
            spotifyUsername: input.spotifyUsername,
        },
    };
}
