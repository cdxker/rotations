import { useEffect, useState, useCallback } from "react"
import PlayerLayout from "./PlayerLayout"
import { PlaylistGridCard } from "./PlaylistGridCard"
import type {
    FuckingPlaylist,
    FuckingTrack,
    SpotifyPlaylistsResponse,
    SpotifyPlaylistTracksResponse,
    SpotifyUserProfile,
} from "@/shared/types"
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer"
import { formatTime } from "@/lib/utils"

interface PlayerTrack {
    uri: string
    name: string
    artists: { name: string }[]
    album: { name: string; images: { url: string }[] }
}

const SpotifyView = () => {
    const [user, setUser] = useState<SpotifyUserProfile | null>(null)
    const [playlists, setPlaylists] = useState<FuckingPlaylist[]>([])
    const [selectedPlaylist, setSelectedPlaylist] = useState<FuckingPlaylist | null>(null)
    const [tracks, setTracks] = useState<FuckingTrack[]>([])
    const [loading, setLoading] = useState(true)
    const [tracksLoading, setTracksLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [isReady, setIsReady] = useState(false)
    const [isPaused, setIsPaused] = useState(true)
    const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null)

    const handleReady = useCallback(() => setIsReady(true), [])
    const handleNotReady = useCallback(() => setIsReady(false), [])
    const handleError = useCallback(() => setIsReady(false), [])
    const handlePlayerStateChanged = useCallback((state: unknown) => {
        const typedState = state as {
            paused: boolean
            track_window: { current_track: PlayerTrack }
        }
        setIsPaused(typedState.paused)
        setCurrentTrack(typedState.track_window.current_track)
    }, [])

    const { playerRef, deviceIdRef } = useSpotifyPlayer({
        name: "Rotations Web Player",
        onReady: handleReady,
        onNotReady: handleNotReady,
        onPlayerStateChanged: handlePlayerStateChanged,
        onError: handleError,
    })

    useEffect(() => {
        const fetchData = async () => {
            try {
                const userRes = await fetch("/api/spotify/me")
                const userData = await userRes.json()

                if (!userData.user) {
                    window.location.href = "/bad-onboarding"
                    return
                }

                setUser(userData.user)

                const playlistsRes = await fetch("/api/spotify/playlists?limit=50")
                if (!playlistsRes.ok) {
                    throw new Error("Failed to fetch playlists")
                }

                const playlistsData: SpotifyPlaylistsResponse = await playlistsRes.json()
                setPlaylists(playlistsData.items)
            } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong")
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [])

    const handlePlaylistClick = async (playlist: FuckingPlaylist) => {
        setSelectedPlaylist(playlist)
        setTracksLoading(true)
        setTracks([])
        setError(null)

        try {
            const spotifyId = playlist.id.replace("play-spotify-", "")
            const res = await fetch(`/api/spotify/playlists/${spotifyId}/tracks?limit=50`)
            if (!res.ok) throw new Error("Failed to fetch tracks")

            const data: SpotifyPlaylistTracksResponse = await res.json()
            const trackList = data.items
            setTracks(trackList)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load tracks")
        } finally {
            setTracksLoading(false)
        }
    }

    const handleTrackClick = async (track: FuckingTrack) => {
        if (!selectedPlaylist || !deviceIdRef.current) return
        const spotifyPlaylistId = selectedPlaylist.id.replace("play-spotify-", "")
        const spotifyTrackId = track.audio.type === "spotify" ? track.audio.id : null
        if (!spotifyTrackId) return
        try {
            await fetch("/api/spotify/play", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device_id: deviceIdRef.current,
                    context_uri: `spotify:playlist:${spotifyPlaylistId}`,
                    offset: { uri: `spotify:track:${spotifyTrackId}` },
                }),
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to play track")
        }
    }

    const handleBackToPlaylists = () => {
        setSelectedPlaylist(null)
        setTracks([])
    }

    if (loading) {
        return (
            <PlayerLayout>
                <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] text-white">
                    <p className="text-white/50">Loading...</p>
                </div>
            </PlayerLayout>
        )
    }

    if (error) {
        return (
            <PlayerLayout>
                <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] text-white">
                    <p className="text-red-400">{error}</p>
                </div>
            </PlayerLayout>
        )
    }

    return (
        <PlayerLayout>
            <div className="min-h-screen bg-[#0B0B0B] text-white p-8 pb-32">
                <div className="max-w-6xl mx-auto">
                    <div className="flex items-center gap-4 mb-8">
                        {selectedPlaylist ? (
                            <>
                                <button
                                    onClick={handleBackToPlaylists}
                                    className="text-white/50 hover:text-white transition-colors"
                                >
                                    &larr; Back
                                </button>
                                {selectedPlaylist.track_cover_uri && (
                                    <img
                                        src={selectedPlaylist.track_cover_uri}
                                        alt={selectedPlaylist.name}
                                        className="w-16 h-16 rounded"
                                    />
                                )}
                                <div>
                                    <h1 className="text-2xl font-bold">{selectedPlaylist.name}</h1>
                                    <p className="text-white/50">{tracks.length} tracks</p>
                                </div>
                            </>
                        ) : (
                            <>
                                {user?.images?.[0]?.url && (
                                    <img
                                        src={user.images[0].url}
                                        alt={user.display_name || "Profile"}
                                        className="w-12 h-12 rounded-full"
                                    />
                                )}
                                <div>
                                    <h1 className="text-2xl font-bold">
                                        {user?.display_name || user?.id}&apos;s Playlists
                                    </h1>
                                    <p className="text-white/50">{playlists.length} playlists</p>
                                </div>
                            </>
                        )}
                    </div>

                    {!isReady && (
                        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-500 text-sm">
                            Connecting to Spotify... (Requires Spotify Premium)
                        </div>
                    )}

                    {selectedPlaylist ? (
                        <div className="space-y-1">
                            {tracksLoading ? (
                                <p className="text-white/50">Loading tracks...</p>
                            ) : (
                                tracks.map((track, index) => {
                                    const spotifyUri =
                                        track.audio.type === "spotify"
                                            ? `spotify:track:${track.audio.id}`
                                            : track.id
                                    return (
                                        <button
                                            key={track.id}
                                            onClick={() => handleTrackClick(track)}
                                            disabled={!isReady}
                                            className={`w-full flex items-center gap-4 p-3 rounded hover:bg-white/10 transition-colors text-left ${
                                                currentTrack?.uri === spotifyUri
                                                    ? "bg-white/10"
                                                    : ""
                                            } ${!isReady ? "opacity-50 cursor-not-allowed" : ""}`}
                                        >
                                            <span className="text-white/30 w-6 text-right text-sm">
                                                {index + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p
                                                    className={`truncate ${
                                                        currentTrack?.uri === spotifyUri
                                                            ? "text-green-400"
                                                            : "text-white"
                                                    }`}
                                                >
                                                    {track.name}
                                                </p>
                                                <p className="text-sm text-white/50 truncate">
                                                    {track.artists.join(", ")}
                                                </p>
                                            </div>
                                            <span className="text-white/30 text-sm">
                                                {formatTime(track.time_ms)}
                                            </span>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {playlists.map((playlist) => (
                                <PlaylistGridCard
                                    key={playlist.id}
                                    name={playlist.name}
                                    imageUrl={playlist.track_cover_uri || undefined}
                                    subtitle={playlist.artists.join(", ")}
                                    onClick={() => handlePlaylistClick(playlist)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {currentTrack && (
                <div className="fixed bottom-0 left-0 right-0 bg-[#181818] border-t border-white/10 p-4">
                    <div className="max-w-6xl mx-auto flex items-center gap-4">
                        <img
                            src={
                                currentTrack.album.images?.[2]?.url ||
                                currentTrack.album.images?.[0]?.url
                            }
                            alt={currentTrack.album.name}
                            className="w-14 h-14 rounded"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-white truncate">{currentTrack.name}</p>
                            <p className="text-sm text-white/50 truncate">
                                {currentTrack.artists.map((a) => a.name).join(", ")}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => playerRef.current?.previousTrack()}
                                className="text-white/70 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => playerRef.current?.togglePlay()}
                                className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
                            >
                                {isPaused ? (
                                    <svg
                                        className="w-5 h-5 text-black ml-0.5"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                ) : (
                                    <svg
                                        className="w-5 h-5 text-black"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                    </svg>
                                )}
                            </button>
                            <button
                                onClick={() => playerRef.current?.nextTrack()}
                                className="text-white/70 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </PlayerLayout>
    )
}

export default SpotifyView
