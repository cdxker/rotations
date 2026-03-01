import { describe, it, expect, beforeEach } from "vitest"
import { createStore } from "tinybase"
import { createLocalPersister } from "tinybase/persisters/persister-browser"
import type {
    FuckingPlaylist,
    FuckingTrack,
    FuckingPlaylistWithTracks,
    PlaylistId,
    PlaylistSource,
    TrackId,
} from "@/shared/types"

// Create a fresh store for each test (avoiding singleton issues)
function createTestStore() {
    const store = createStore()
        .setTablesSchema({
            playlists: {
                id: { type: "string" },
                track_cover_uri: { type: "string" },
                name: { type: "string" },
                artists: { type: "string" },
                first_track_id: { type: "string" },
            },
            tracks: {
                id: { type: "string" },
                playlist_id: { type: "string" },
                time_ms: { type: "number" },
                name: { type: "string" },
                artists: { type: "string" },
                tags: { type: "string" },
                stream_url: { type: "string" },
                next_tracks: { type: "string" },
            },
        })
        .setValuesSchema({
            activePlaylist: { type: "string", default: "" },
            activeTrack: { type: "string", default: "" },
            trackTimestamp: { type: "number", default: 0 },
            lastPlaylistId: { type: "string", default: "" },
        })

    return store
}

// Test Database class that uses the test store
class TestDatabase {
    private store: ReturnType<typeof createStore>

    constructor(store: ReturnType<typeof createStore>) {
        this.store = store
    }

    getLastPlaylistId(): PlaylistId | null {
        const id = this.store.getValue("lastPlaylistId") as string
        return id ? (id as PlaylistId) : null
    }

    setLastPlaylistId(id: PlaylistId): void {
        this.store.setValue("lastPlaylistId", id)
    }

    getTrack(trackId: TrackId): FuckingTrack | null {
        const row = this.store.getRow("tracks", trackId)
        if (!row || !row.id) return null

        return {
            id: row.id as TrackId,
            time_ms: row.time_ms as number,
            name: row.name as string,
            artists: JSON.parse((row.artists as string) || "[]"),
            tags: JSON.parse((row.tags as string) || "[]"),
            audio: JSON.parse((row.stream_url as string) || '{"type":"stream","url":""}'),
            next_tracks: row.next_tracks ? JSON.parse(row.next_tracks as string) : undefined,
        }
    }

    getPlaylist(playlistId: PlaylistId): FuckingPlaylist | null {
        const row = this.store.getRow("playlists", playlistId)
        if (!row || !row.id) return null

        const firstTrack = this.getTrack(row.first_track_id as TrackId)
        if (!firstTrack) return null

        const tracks = this.getTracksByPlaylist(playlistId)
        const totalDurationMs = tracks.reduce((acc, t) => acc + t.time_ms, 0)

        return {
            id: row.id as PlaylistId,
            track_cover_uri: row.track_cover_uri as string,
            name: row.name as string,
            artists: JSON.parse((row.artists as string) || "[]"),
            first_track: firstTrack,
            totalDurationMs,
            source: (row.source as PlaylistSource) || null,
        }
    }

    getPlaylistWithTracks(playlistId: PlaylistId): FuckingPlaylistWithTracks | null {
        const playlist = this.getPlaylist(playlistId)
        if (!playlist) return null

        const tracks = this.getTracksByPlaylist(playlistId)
        return { ...playlist, tracks }
    }

    insertTrack(track: FuckingTrack, playlistId: PlaylistId): void {
        this.store.setRow("tracks", track.id, {
            id: track.id,
            playlist_id: playlistId,
            time_ms: track.time_ms,
            name: track.name,
            artists: JSON.stringify(track.artists),
            tags: JSON.stringify(track.tags || []),
            stream_url: JSON.stringify(track.audio),
            next_tracks: track.next_tracks ? JSON.stringify(track.next_tracks) : "",
        })
    }

    insertPlaylist(playlist: FuckingPlaylist): void {
        this.store.setRow("playlists", playlist.id, {
            id: playlist.id,
            track_cover_uri: playlist.track_cover_uri,
            name: playlist.name,
            artists: JSON.stringify(playlist.artists),
            first_track_id: playlist.first_track.id,
        })
    }

    insertPlaylistWithTracks(playlist: FuckingPlaylistWithTracks): void {
        for (const track of playlist.tracks) {
            this.insertTrack(track, playlist.id)
        }
        this.insertPlaylist(playlist)
        this.setLastPlaylistId(playlist.id)
    }

    getPlaylists(): FuckingPlaylist[] {
        const playlists: FuckingPlaylist[] = []
        const rowIds = this.store.getRowIds("playlists")

        for (const rowId of rowIds) {
            const playlist = this.getPlaylist(rowId as PlaylistId)
            if (playlist) {
                playlists.push(playlist)
            }
        }

        return playlists
    }

    getTracksByPlaylist(playlistId: PlaylistId): FuckingTrack[] {
        const tracks: FuckingTrack[] = []
        const rowIds = this.store.getRowIds("tracks")

        for (const rowId of rowIds) {
            const row = this.store.getRow("tracks", rowId)
            if (row.playlist_id === playlistId) {
                const track = this.getTrack(rowId as TrackId)
                if (track) {
                    tracks.push(track)
                }
            }
        }

        return tracks
    }
}

// Test data
const mockTrack1: FuckingTrack = {
    id: "track-1" as TrackId,
    time_ms: 180000,
    name: "Test Track 1",
    artists: ["Artist 1", "Artist 2"],
    tags: ["electronic", "ambient"],
    audio: { type: "stream", url: "https://example.com/track1.mp3" },
}

const mockTrack2: FuckingTrack = {
    id: "track-2" as TrackId,
    time_ms: 240000,
    name: "Test Track 2",
    artists: ["Artist 1"],
    audio: { type: "stream", url: "https://example.com/track2.mp3" },
}

const mockPlaylist: FuckingPlaylistWithTracks = {
    id: "play-test-album" as PlaylistId,
    track_cover_uri: "https://example.com/cover.jpg",
    name: "Test Album",
    artists: ["Artist 1"],
    first_track: mockTrack1,
    totalDurationMs: 420000,
    tracks: [mockTrack1, mockTrack2],
    source: "bandcamp",
}

describe("TinyBase Store", () => {
    let store: ReturnType<typeof createStore>
    let db: TestDatabase

    beforeEach(() => {
        store = createTestStore()
        db = new TestDatabase(store)
    })

    describe("Track operations", () => {
        it("should insert and retrieve a track", () => {
            db.insertTrack(mockTrack1, mockPlaylist.id)

            const retrieved = db.getTrack(mockTrack1.id)
            expect(retrieved).not.toBeNull()
            expect(retrieved!.id).toBe(mockTrack1.id)
            expect(retrieved!.name).toBe(mockTrack1.name)
            expect(retrieved!.time_ms).toBe(mockTrack1.time_ms)
            expect(retrieved!.artists).toEqual(mockTrack1.artists)
            expect(retrieved!.tags).toEqual(mockTrack1.tags)
            expect(retrieved!.audio).toEqual(mockTrack1.audio)
        })

        it("should return null for non-existent track", () => {
            const retrieved = db.getTrack("track-nonexistent" as TrackId)
            expect(retrieved).toBeNull()
        })
    })

    describe("Playlist operations", () => {
        it("should insert and retrieve a playlist", () => {
            db.insertTrack(mockTrack1, mockPlaylist.id)
            db.insertPlaylist(mockPlaylist)

            const retrieved = db.getPlaylist(mockPlaylist.id)
            expect(retrieved).not.toBeNull()
            expect(retrieved!.id).toBe(mockPlaylist.id)
            expect(retrieved!.name).toBe(mockPlaylist.name)
            expect(retrieved!.artists).toEqual(mockPlaylist.artists)
            expect(retrieved!.track_cover_uri).toBe(mockPlaylist.track_cover_uri)
            expect(retrieved!.first_track.id).toBe(mockTrack1.id)
        })

        it("should return null for non-existent playlist", () => {
            const retrieved = db.getPlaylist("play-nonexistent" as PlaylistId)
            expect(retrieved).toBeNull()
        })
    })

    describe("Playlist with tracks operations", () => {
        it("should insert and retrieve playlist with all tracks", () => {
            db.insertPlaylistWithTracks(mockPlaylist)

            const retrieved = db.getPlaylistWithTracks(mockPlaylist.id)
            expect(retrieved).not.toBeNull()
            expect(retrieved!.tracks).toHaveLength(2)
            expect(retrieved!.tracks[0].id).toBe(mockTrack1.id)
            expect(retrieved!.tracks[1].id).toBe(mockTrack2.id)
        })

        it("should set lastPlaylistId when inserting playlist with tracks", () => {
            db.insertPlaylistWithTracks(mockPlaylist)

            const lastId = db.getLastPlaylistId()
            expect(lastId).toBe(mockPlaylist.id)
        })
    })

    describe("Multiple playlists", () => {
        it("should retrieve all playlists", () => {
            db.insertPlaylistWithTracks(mockPlaylist)

            const secondPlaylist: FuckingPlaylistWithTracks = {
                id: "play-second-album" as PlaylistId,
                track_cover_uri: "https://example.com/cover2.jpg",
                name: "Second Album",
                artists: ["Another Artist"],
                first_track: {
                    id: "track-3" as TrackId,
                    time_ms: 200000,
                    name: "Track 3",
                    artists: ["Another Artist"],
                    audio: { type: "stream", url: "https://example.com/track3.mp3" },
                },
                totalDurationMs: 200000,
                tracks: [
                    {
                        id: "track-3" as TrackId,
                        time_ms: 200000,
                        name: "Track 3",
                        artists: ["Another Artist"],
                        audio: { type: "stream", url: "https://example.com/track3.mp3" },
                    },
                ],
                source: "bandcamp",
            }
            db.insertPlaylistWithTracks(secondPlaylist)

            const playlists = db.getPlaylists()
            expect(playlists).toHaveLength(2)
        })
    })

    describe("localStorage persistence", () => {
        it("should persist to localStorage and reload", async () => {
            const storeKey = "test-music-store"

            // Clear any existing data
            localStorage.removeItem(storeKey)

            // Create store with persister
            const persistedStore = createTestStore()
            const persister = createLocalPersister(persistedStore, storeKey)

            // Insert data
            persistedStore.setRow("tracks", mockTrack1.id, {
                id: mockTrack1.id,
                playlist_id: mockPlaylist.id,
                time_ms: mockTrack1.time_ms,
                name: mockTrack1.name,
                artists: JSON.stringify(mockTrack1.artists),
                tags: JSON.stringify(mockTrack1.tags || []),
                stream_url: JSON.stringify(mockTrack1.audio),
                next_tracks: "",
            })

            // Save to localStorage
            await persister.save()

            // Create a new store and load from localStorage
            const newStore = createTestStore()
            const newPersister = createLocalPersister(newStore, storeKey)
            await newPersister.load()

            // Verify data was loaded
            const row = newStore.getRow("tracks", mockTrack1.id)
            expect(row.name).toBe(mockTrack1.name)
            expect(row.time_ms).toBe(mockTrack1.time_ms)

            // Cleanup
            localStorage.removeItem(storeKey)
        })
    })
})
