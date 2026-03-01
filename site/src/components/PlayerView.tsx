import { useEffect, useMemo, useState } from "react"
import type { FuckingPlaylist, FuckingTrack, PlaylistId, TrackId } from "@/shared/types"
import { db } from "@/lib/store"
import SideTrack from "./SideTrack"
import { usePlayer } from "@/hooks/PlayerContext"
import { cn, formatTime, formatDuration } from "@/lib/utils"
import { Pause, Play } from "lucide-react"
import { TimeSlider } from "./TimeSlider"
import PlayerLayout from "./PlayerLayout"
import { SpotifyAddContent } from "./SpotifyAddView"

type ViewMode = "player" | "playlists" | "spotify-add"

export type { ViewMode }

function MusicView() {
    const {
        playlist,
        tracks,
        currentTrackIndex,
        currentTimeMs,
        isPlaying,
        currentTrack,
        togglePlayPause,
        handleTrackSelect,
    } = usePlayer()

    const remainingMs = useMemo(() => {
        if (!currentTrack) return 0
        const remainingInCurrentTrack = currentTrack.time_ms - currentTimeMs
        const remainingTracks = tracks.slice(currentTrackIndex + 1)
        const remainingTracksTime = remainingTracks.reduce((acc, track) => acc + track.time_ms, 0)
        return remainingInCurrentTrack + remainingTracksTime
    }, [currentTrack, currentTrackIndex, currentTimeMs, tracks])

    const remainingMinutes = Math.floor(remainingMs / 60000)

    const nextTracks = useMemo(() => {
        if (!currentTrack?.next_tracks || !playlist) return []
        return Object.entries(currentTrack.next_tracks)
            .filter(([playlistId]) => playlistId !== playlist.id)
            .filter(
                ([playlistId, track]) =>
                    track !== undefined &&
                    track !== null &&
                    playlistId !== null &&
                    playlistId !== undefined
            )
            .map(([playlistId, trackId]) => ({
                playlist: db.getPlaylist(playlistId as PlaylistId) as FuckingPlaylist,
                track: db.getTrack(trackId as TrackId) as FuckingTrack,
            }))
    }, [currentTrack, playlist])

    if (!playlist || !currentTrack) {
        return null
    }

    return (
        <div className="flex flex-col gap-4 justify-center items-center">
            <div className="max-w-2xl">
                <SideTrack
                    track={nextTracks[0]?.track}
                    playlist={nextTracks[0]?.playlist}
                    position="left"
                />
                <div className="text-white/90 text-2xl">
                    <p className="capitalize">{playlist.name}</p>
                </div>
                <div className="mt-2 relative z-20">
                    <div>
                        <img
                            src={playlist.track_cover_uri}
                            alt={`${playlist.name} album cover`}
                            className="w-full aspect-square object-cover"
                        />
                        <button
                            onClick={togglePlayPause}
                            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                        >
                            {!isPlaying && <Play color="#fff" size="50" />}
                            {isPlaying && <Pause color="#fff" size="50" />}
                        </button>
                    </div>
                </div>
                <SideTrack
                    track={nextTracks[1]?.track}
                    playlist={nextTracks[1]?.playlist}
                    position="right"
                />

                <div className="mt-4 space-y-1">
                    <div className="text-white/90 text-2xl">
                        <p className="capitalize">{currentTrack.name}</p>
                    </div>
                    <div className="flex justify-between text-white/60 text-lg">
                        <span>by {playlist.artists[0]}</span>
                        <span>{remainingMinutes} minutes left</span>
                    </div>
                </div>
                <div className="mt-4 space-y-3 z-20 -ml-6">
                    {tracks.map((track, index) => (
                        <div
                            key={track.id}
                            className="flex items-center justify-between text-white/70 cursor-pointer hover:text-white/90 transition-colors"
                            onClick={() => handleTrackSelect(index)}
                        >
                            <div className="flex items-center gap-3">
                                <span
                                    className={cn("z-20 text-base ml-6", {
                                        "text-white": index === currentTrackIndex,
                                    })}
                                >
                                    {track.name}
                                </span>
                            </div>
                            <span className="text-sm">{formatTime(track.time_ms)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function PlaylistsContent({ onPlaylistClick }: { onPlaylistClick: (id: PlaylistId) => void }) {
    const [playlists, setPlaylists] = useState<FuckingPlaylist[]>(() => db.getPlaylists())

    return (
        <div className="max-w-2xl mx-auto">
            <div className="space-y-4">
                {playlists.map((playlist) => (
                    <div
                        key={playlist.id}
                        className="flex gap-4 cursor-pointer hover:bg-white/5 rounded-lg p-2 -mx-2 transition-colors"
                        onClick={() => onPlaylistClick(playlist.id)}
                    >
                        <img
                            src={playlist.track_cover_uri}
                            alt={`${playlist.name} cover`}
                            className="w-16 h-16 object-cover rounded"
                        />
                        <div className="flex flex-col justify-center min-w-0 flex-1">
                            <span className="text-white font-medium truncate">{playlist.name}</span>
                            <span className="text-white/50 text-sm">
                                {playlist.artists[0]} · {formatDuration(playlist.totalDurationMs)}
                            </span>
                            {playlist.first_track.tags && playlist.first_track.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {playlist.first_track.tags.slice(0, 5).map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-2 py-0.5 text-xs text-white/60 border border-white/20 rounded-full"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {playlists.length === 0 && (
                <div className="text-white/40 text-center py-16">
                    No playlists yet. Add some music!
                </div>
            )}
        </div>
    )
}

function PlayerView({ initialView = "player" }: { initialView?: ViewMode }) {
    const [view, setView] = useState<ViewMode>(initialView)
    const [playlists, setPlaylists] = useState<FuckingPlaylist[]>(() => db.getPlaylists())
    const { setPlaylistAndTracks } = usePlayer()

    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname
            if (path === "/more") setView("playlists")
            else if (path === "/spotify/add") setView("spotify-add")
            else setView("player")
        }
        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [])

    useEffect(() => {
        const targetPath =
            view === "playlists" ? "/more" : view === "spotify-add" ? "/spotify/add" : "/"
        if (window.location.pathname !== targetPath) {
            window.history.pushState({}, "", targetPath)
        }
    }, [view])

    const handlePlaylistClick = (playlistId: PlaylistId) => {
        db.setPlayerState({ lastPlaylistId: playlistId })
        setPlaylistAndTracks({ playlistId })
        setView("player")
    }

    return (
        <div className="flex flex-col min-h-screen bg-[#0B0B0B] text-white">
            {view === "playlists" && (
                <div className="px-5 pt-8 pb-12">
                    <TimeSlider expanded onViewChange={setView} />
                    <PlaylistsContent onPlaylistClick={handlePlaylistClick} />
                </div>
            )}
            {view === "player" && (
                <div className="px-5 pt-8 pb-12">
                    {playlists.length > 0 && <MusicView />}
                    <TimeSlider expanded={false} onViewChange={setView} />
                </div>
            )}
            {view === "spotify-add" && (
                <>
                    <SpotifyAddContent onBack={() => setView("player")} />
                    <TimeSlider expanded={false} onViewChange={setView} />
                </>
            )}
        </div>
    )
}

function PlayerViewWithLayout({ initialView = "player" }: { initialView?: ViewMode }) {
    return (
        <PlayerLayout>
            <PlayerView initialView={initialView} />
        </PlayerLayout>
    )
}

export default PlayerViewWithLayout
