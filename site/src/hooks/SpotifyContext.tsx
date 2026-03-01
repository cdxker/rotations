import {
    createContext,
    useState,
    useEffect,
    useContext,
    type ReactNode,
    useCallback,
} from "react"
import type {
    FuckingPlaylist,
    SpotifyPlaylistTracksResponse,
    SpotifyUserProfile,
} from "@/shared/types"
import type { SpotifyPlayerInstance } from "@/shared/spotify-sdk"
import { useSpotifyPlayer } from "./useSpotifyPlayer"
import { usePlayer } from "./PlayerContext"

export interface SpotifyContextValue {
    spotifyUser: SpotifyUserProfile | null
    spotifyDeviceId: string | null
    spotifyLogin: () => void
    addSpotifyPlaylist: (playlist: FuckingPlaylist) => Promise<void>
    isLoadingUser: boolean
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null)

interface SpotifyProviderProps {
    children: ReactNode
}

export function SpotifyProvider({ children }: SpotifyProviderProps) {
    const [spotifyUser, setSpotifyUser] = useState<SpotifyUserProfile | null>(null)
    const [isLoadingUser, setIsLoadingUser] = useState(true)

    const {
        addPlaylists,
        addTracks,
        spotifyDeviceId,
        setSpotifyDeviceId,
        setSpotifyPlayer,
        setCurrentTimeMs,
    } = usePlayer()

    useEffect(() => {
        fetch("/api/spotify/me", {
            credentials: "include",
        })
            .then((res) => res.json())
            .then((data: { user: SpotifyUserProfile | null }) => {
                setSpotifyUser(data.user)
            })
            .finally(() => {
                setIsLoadingUser(false)
            })
    }, [])

    const addSpotifyPlaylist = useCallback(
        async (playlist: FuckingPlaylist) => {
            const spotifyId = playlist.id.replace("play-spotify-", "")
            const tracksRes = await fetch(`/api/spotify/playlists/${spotifyId}/tracks?limit=50`)
            const tracksData: SpotifyPlaylistTracksResponse = await tracksRes.json()
            const tracks = tracksData.items

            if (tracks.length > 0) {
                playlist.first_track = tracks[0]
                playlist.totalDurationMs = tracks.reduce((sum, t) => sum + t.time_ms, 0)
            }
            addPlaylists([playlist])
            addTracks(tracks, playlist.id)
        },
        [addPlaylists, addTracks]
    )

    const handleReady = useCallback(
        (deviceId: string) => setSpotifyDeviceId(deviceId),
        [setSpotifyDeviceId]
    )
    const handleNotReady = useCallback(() => setSpotifyDeviceId(null), [setSpotifyDeviceId])
    const handlePlayerCreated = useCallback(
        (player: SpotifyPlayerInstance) => setSpotifyPlayer(player),
        [setSpotifyPlayer]
    )
    const handlePositionChange = useCallback(
        (positionMs: number) => setCurrentTimeMs(positionMs),
        [setCurrentTimeMs]
    )

    useSpotifyPlayer({
        name: "Rotations Player",
        enabled: !!spotifyUser,
        onReady: handleReady,
        onNotReady: handleNotReady,
        onPlayerCreated: handlePlayerCreated,
        positionPollIntervalMs: 250,
        onPositionChange: handlePositionChange,
    })

    const spotifyLogin = () => {
        window.location.href = "/api/spotify/authorize"
    }

    const value: SpotifyContextValue = {
        spotifyUser,
        spotifyDeviceId,
        spotifyLogin,
        addSpotifyPlaylist,
        isLoadingUser,
    }

    return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>
}

export function useSpotify(): SpotifyContextValue {
    const context = useContext(SpotifyContext)
    if (!context) {
        throw new Error("useSpotify must be used within a SpotifyProvider")
    }
    return context
}
