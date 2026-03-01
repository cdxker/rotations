import { useEffect, useRef, type RefObject } from "react"
import type { SpotifyPlayerInstance } from "@/shared/spotify-sdk"

export interface UseSpotifyPlayerConfig {
    /** Player name shown in Spotify Connect */
    name: string
    /** If provided, the hook will not initialize until this is truthy */
    enabled?: boolean
    /** Called when the player is ready with its device ID */
    onReady?: (deviceId: string) => void
    /** Called when the player becomes not ready */
    onNotReady?: () => void
    /** Called when the player state changes */
    onPlayerStateChanged?: (state: unknown) => void
    /** Called when an error occurs (initialization, authentication, account) */
    onError?: (type: "initialization" | "authentication" | "account") => void
    /** Called with the player instance once created */
    onPlayerCreated?: (player: SpotifyPlayerInstance) => void
    /** If provided, sets up a position polling interval at the given ms rate */
    positionPollIntervalMs?: number
    /** Called with the current position when polling */
    onPositionChange?: (positionMs: number) => void
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
        onPlayerCreated,
        positionPollIntervalMs,
        onPositionChange,
    } = config

    useEffect(() => {
        if (!enabled) return

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
                    name,
                    getOAuthToken: (cb) => cb(token),
                    volume: 0.5,
                })

                player.addListener("ready", (state) => {
                    const { device_id } = state as { device_id: string }
                    deviceIdRef.current = device_id
                    onReady?.(device_id)
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

                if (positionPollIntervalMs && onPositionChange) {
                    setInterval(() => {
                        player.getCurrentState().then((state) => {
                            if (state) onPositionChange(state.position)
                        })
                    }, positionPollIntervalMs)
                }

                player.connect()
                playerRef.current = player
                onPlayerCreated?.(player)
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
        }
        // We intentionally only re-run when `enabled` or `name` changes.
        // Callbacks are expected to be stable (or wrapped in useCallback by callers).
    }, [enabled, name])

    return { playerRef, deviceIdRef }
}
