import { useState, useEffect, type ReactNode } from "react"
import type { FuckingPlaylist, FuckingTrack, PlaylistId } from "../shared/types"
import { db } from "@/lib/store"
import { DEFAULT_PLAYLIST_ID, defaultPlaylist, defaultTracks } from "@/lib/defaultPlaylist"
import { musicCache } from "@/lib/musicCache"
import { shuffleAssociations } from "@/lib/associations"
import { PlayerProvider } from "@/hooks/PlayerContext"
import { SpotifyProvider } from "@/hooks/SpotifyContext"

export default function PlayerLayout({ children }: { children: ReactNode }) {
    const [initData, setInitData] = useState<{
        playlist?: FuckingPlaylist
        tracks: FuckingTrack[]
        initialTrackIndex: number
        initialTimeMs: number
    } | null>(null)
    const [initializing, setInitializing] = useState(true)

    useEffect(() => {
        const init = async () => {
            await db.init()
            await musicCache.init()
            const playerState = db.getPlayerState()

            // insertPlaylist moves lastPlaylistId, so put it back and a returning listener keeps their spot
            if (!db.getPlaylist(DEFAULT_PLAYLIST_ID)) {
                db.insertPlaylist(defaultPlaylist)
                db.insertTracks(defaultTracks, DEFAULT_PLAYLIST_ID)
                db.setPlayerState({ lastPlaylistId: playerState?.lastPlaylistId ?? ("" as PlaylistId) })
            }

            let playlist: FuckingPlaylist | undefined = defaultPlaylist
            let tracks: FuckingTrack[] = defaultTracks
            let initialTrackIndex = 0
            let initialTimeMs = 0

            if (playerState) {
                const savedPlaylist = db.getPlaylist(playerState.lastPlaylistId)
                const savedTracks = db.getTracks(playerState.lastPlaylistId)
                if (savedPlaylist && savedTracks.length > 0) {
                    const trackIndex = savedTracks.findIndex(
                        (t) => t.id === playerState.activeTrack
                    )
                    if (trackIndex !== -1) {
                        initialTrackIndex = trackIndex
                    }

                    initialTimeMs = playerState.trackTimestamp
                    playlist = savedPlaylist
                    tracks = savedTracks
                }
                shuffleAssociations()
            }

            setInitData({ playlist, tracks, initialTrackIndex, initialTimeMs })
            setInitializing(false)
        }
        init()
    }, [])

    if (initializing || !initData) {
        return <div className="min-h-screen bg-[#0B0B0B]" />
    }

    return (
        <PlayerProvider
            initialPlaylist={initData.playlist}
            initialTracks={initData.tracks}
            initialTrackIndex={initData.initialTrackIndex}
            initialTimeMs={initData.initialTimeMs}
        >
            <SpotifyProvider>{children}</SpotifyProvider>
        </PlayerProvider>
    )
}
