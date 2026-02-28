import {
    createContext,
    useState,
    useEffect,
    useContext,
    useRef,
    type ReactNode,
    useCallback,
} from "react"
import type {
    FuckingPlaylist,
    SpotifyPlaylistTracksResponse,
    SpotifyUserProfile,
} from "@/shared/types"
import type { SpotifyPlayerInstance } from "@/shared/spotify-sdk"
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
    const playerRef = useRef<SpotifyPlayerInstance | null>(null)

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

    useEffect(() => {
        if (!spotifyUser) return

        let mounted = true

        const initPlayer = async () => {
            const res = await fetch("/api/spotify/token")
            const data = await res.json()
            if (!data.token || !mounted) return

            const token = data.token

            // Load SDK script if not already loaded
            if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
                const script = document.createElement("script")
                script.src = "https://sdk.scdn.co/spotify-player.js"
                script.async = true
                document.body.appendChild(script)
            }

            window.onSpotifyWebPlaybackSDKReady = () => {
                if (playerRef.current || !mounted || !window.Spotify) return

                const player = new window.Spotify.Player({
                    name: "Rotations Player",
                    getOAuthToken: (cb) => cb(token),
                    volume: 0.5,
                })

                player.addListener("ready", (state) => {
                    const { device_id } = state as { device_id: string }
                    setSpotifyDeviceId(device_id)
                })

                player.addListener("not_ready", () => {
                    setSpotifyDeviceId(null)
                })

                setInterval(() => {
                    player.getCurrentState().then((state) => {
                        if (state) setCurrentTimeMs(state.position)
                    })
                }, 250)

                player.connect()
                playerRef.current = player
                setSpotifyPlayer(player)
            }

            // If SDK already loaded, initialize immediately
            if (window.Spotify) {
                window.onSpotifyWebPlaybackSDKReady()
            }
        }

        initPlayer()

        return () => {
            mounted = false
            playerRef.current?.disconnect()
            playerRef.current = null
            setSpotifyPlayer(null)
        }
    }, [spotifyUser, setSpotifyPlayer, setSpotifyDeviceId, setCurrentTimeMs])

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
