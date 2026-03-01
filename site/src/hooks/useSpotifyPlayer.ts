import { useEffect, useRef, type RefObject } from "react"
import type { SpotifyPlayerInstance } from "@/shared/spotify-sdk"

export interface UseSpotifyPlayerConfig {
    /** Player name shown in Spotify Connect */
    name: string
    /** If provided, the hook will not initialize until this is truthy */
    enabled?: boolean
    /** Called when the player is ready with its device ID and player instance */
    onReady: (deviceId: string, player: SpotifyPlayerInstance) => void
    /** Called when the player becomes not ready */
    onNotReady?: () => void
    /** Called when the player state changes */
    onPlayerStateChanged?: (state: unknown) => void
    /** Called when an error occurs (initialization, authentication, account) */
    onError?: (type: "initialization" | "authentication" | "account") => void
    /** Called during cleanup so callers can clear their external references */
    onCleanup?: () => void
    /** If provided, sets up a position polling interval */
    positionPolling?: { intervalMs: number; onChange: (ms: number) => void }
}

/**
 * Hook that handles Spotify Web Playback SDK script loading, player creation,
 * and connection. Both SpotifyContext and SpotifyView use this to avoid
 * duplicating the SDK initialization logic.
 */
export function useSpotifyPlayer(config: UseSpotifyPlayerConfig): {
    playerRef: RefObject<SpotifyPlayerInstance | null>
    deviceIdRef: RefObject<string | null>
} {
    const playerRef = useRef<SpotifyPlayerInstance | null>(null)
    const deviceIdRef = useRef<string | null>(null)

    const {
        name,
        enabled = true,
        onReady,
        onNotReady,
        onPlayerStateChanged,
        onError,
        onCleanup,
        positionPolling,
    } = config

    useEffect(() => {
        if (!enabled) return

        let mounted = true
        let pollInterval: ReturnType<typeof setInterval> | null = null

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
                    name,
                    getOAuthToken: (cb) => cb(token),
                    volume: 0.5,
                })

                player.addListener("ready", (state) => {
                    const { device_id } = state as { device_id: string }
                    deviceIdRef.current = device_id
                    onReady(device_id, player)
                })

                player.addListener("not_ready", () => {
                    deviceIdRef.current = null
                    onNotReady?.()
                })

                if (onPlayerStateChanged) {
                    player.addListener("player_state_changed", (state) => {
                        if (!state) return
                        onPlayerStateChanged(state)
                    })
                }

                if (onError) {
                    player.addListener("initialization_error", () => onError("initialization"))
                    player.addListener("authentication_error", () => onError("authentication"))
                    player.addListener("account_error", () => onError("account"))
                }

                if (positionPolling) {
                    pollInterval = setInterval(() => {
                        player.getCurrentState().then((state) => {
                            if (state) positionPolling.onChange(state.position)
                        })
                    }, positionPolling.intervalMs)
                }

                player.connect()
                playerRef.current = player
            }

            // If SDK already loaded, initialize immediately
            if (window.Spotify) {
                window.onSpotifyWebPlaybackSDKReady()
            }
        }

        initPlayer()

        return () => {
            mounted = false
            if (pollInterval) clearInterval(pollInterval)
            playerRef.current?.disconnect()
            playerRef.current = null
            onCleanup?.()
        }
        // We intentionally only re-run when `enabled` or `name` changes.
        // Callbacks are expected to be stable (or wrapped in useCallback by callers).
    }, [enabled, name])

    return { playerRef, deviceIdRef }
}
