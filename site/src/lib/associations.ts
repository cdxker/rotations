import { db } from "./store"
import type { FuckingTrack, PlaylistId, TrackId } from "@/shared/types"

function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}

function pickRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]
}

export function shuffleAssociations(): void {
    const playlists = db.getPlaylists()
    if (playlists.length === 0) return

    const allTracks: FuckingTrack[] = []
    const tracksByPlaylist = new Map<PlaylistId, FuckingTrack[]>()
    const trackToPlaylist = new Map<TrackId, PlaylistId>()

    for (const playlist of playlists) {
        const tracks = db.getTracks(playlist.id)
        tracksByPlaylist.set(playlist.id, tracks)
        for (const t of tracks) trackToPlaylist.set(t.id, playlist.id)
        allTracks.push(...tracks)
    }

    if (allTracks.length === 0) return

    const playlistIds = Array.from(tracksByPlaylist.keys())

    for (const currentTrack of allTracks) {
        const currentPlaylistId = trackToPlaylist.get(currentTrack.id)
        if (!currentPlaylistId) continue

        // Get playlists other than the current track's playlist
        const otherPlaylistIds = playlistIds.filter((id) => id !== currentPlaylistId)

        const nextTracks: Record<PlaylistId, TrackId> = {}

        if (otherPlaylistIds.length >= 2) {
            // Pick 2 unique random playlists
            for (const playlistId of shuffleArray(otherPlaylistIds).slice(0, 2)) {
                const tracks = tracksByPlaylist.get(playlistId)
                if (tracks && tracks.length > 0) {
                    nextTracks[playlistId] = pickRandom(tracks).id
                }
            }
        } else if (otherPlaylistIds.length === 1) {
            // Only 1 other playlist - pick 2 different tracks from it
            const playlistId = otherPlaylistIds[0]
            const tracks = tracksByPlaylist.get(playlistId)
            if (tracks && tracks.length >= 1) {
                nextTracks[playlistId] = pickRandom(tracks).id
            }
            // Also include a track from the same playlist as fallback
            const ownTracks = tracksByPlaylist.get(currentPlaylistId)
            if (ownTracks && ownTracks.length > 1) {
                const otherOwnTracks = ownTracks.filter((t) => t.id !== currentTrack.id)
                if (otherOwnTracks.length > 0) {
                    nextTracks[currentPlaylistId] = pickRandom(otherOwnTracks).id
                }
            }
        } else {
            // No other playlists - pick 2 different tracks from same playlist
            const ownTracks = tracksByPlaylist.get(currentPlaylistId)
            if (ownTracks && ownTracks.length > 1) {
                const otherOwnTracks = ownTracks.filter((t) => t.id !== currentTrack.id)
                if (otherOwnTracks.length > 0) {
                    nextTracks[currentPlaylistId] = pickRandom(otherOwnTracks).id
                }
            }
        }

        db.updateTrack({ ...currentTrack, next_tracks: nextTracks })
    }
}
