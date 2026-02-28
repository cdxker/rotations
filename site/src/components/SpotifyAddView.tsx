import { useEffect, useState } from "react"
import PlayerLayout from "./PlayerLayout"
import { useSpotify } from "@/hooks/SpotifyContext"
import { Button } from "./ui/button"
import type { FuckingPlaylist, SpotifyPlaylistsResponse } from "@/shared/types"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

const ITEMS_PER_PAGE = 20

export function SpotifyAddContent({ onBack }: { onBack?: () => void }) {
    const { spotifyUser, addSpotifyPlaylist, isLoadingUser } = useSpotify()
    const [playlists, setPlaylists] = useState<FuckingPlaylist[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [adding, setAdding] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [offset, setOffset] = useState(0)
    const [total, setTotal] = useState(0)

    useEffect(() => {
        if (isLoadingUser) return

        if (!spotifyUser) {
            onBack ? onBack() : (window.location.href = "/player")
            return
        }

        const fetchPlaylists = async () => {
            setError(null)
            try {
                const res = await fetch(
                    `/api/spotify/playlists?limit=${ITEMS_PER_PAGE}&offset=${offset}`
                )
                if (!res.ok) {
                    throw new Error("Failed to fetch playlists")
                }
                const data: SpotifyPlaylistsResponse = await res.json()
                setPlaylists(data.items)
                setTotal(data.total)
            } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong")
            }
        }

        fetchPlaylists()
    }, [spotifyUser, isLoadingUser, offset, onBack])

    const toggleSelection = (playlistId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(playlistId)) {
                next.delete(playlistId)
            } else {
                next.add(playlistId)
            }
            return next
        })
    }

    const handleAddSelected = async () => {
        if (selectedIds.size === 0) return

        setAdding(true)
        try {
            const playlistsToAdd = playlists.filter((p) => selectedIds.has(p.id))
            for (const playlist of playlistsToAdd) {
                await addSpotifyPlaylist(playlist)
            }
            onBack ? onBack() : (window.location.href = "/player")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add playlists")
            setAdding(false)
        }
    }

    const totalPages = Math.ceil(total / ITEMS_PER_PAGE)
    const currentPage = Math.floor(offset / ITEMS_PER_PAGE) + 1

    if (error && playlists.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] text-white">
                <p className="text-red-400">{error}</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0B0B0B] text-white p-8 pb-32">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => (onBack ? onBack() : (window.location.href = "/player"))}
                            className="text-white/50 hover:text-white transition-colors"
                        >
                            &larr; Back
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold">Add Spotify Music</h1>
                            <p className="text-white/50">
                                {selectedIds.size} selected of {total} playlists
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={handleAddSelected}
                        disabled={selectedIds.size === 0 || adding}
                        className="bg-green-500 hover:bg-green-600 text-black font-semibold"
                    >
                        {adding ? "Adding..." : `Add ${selectedIds.size} Selected`}
                    </Button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {playlists.map((playlist) => {
                        const isSelected = selectedIds.has(playlist.id)
                        return (
                            <button
                                key={playlist.id}
                                onClick={() => toggleSelection(playlist.id)}
                                className={cn(
                                    "group bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors text-left relative",
                                    isSelected && "ring-2 ring-green-500 bg-green-500/10"
                                )}
                            >
                                {isSelected && (
                                    <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                        <Check className="w-4 h-4 text-black" />
                                    </div>
                                )}
                                <div className="aspect-square mb-4 bg-white/10 rounded overflow-hidden">
                                    {playlist.track_cover_uri ? (
                                        <img
                                            src={playlist.track_cover_uri}
                                            alt={playlist.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/30">
                                            No Image
                                        </div>
                                    )}
                                </div>
                                <h3
                                    className={cn(
                                        "font-medium truncate transition-colors",
                                        isSelected ? "text-green-400" : "group-hover:text-green-400"
                                    )}
                                >
                                    {playlist.name}
                                </h3>
                                <p className="text-sm text-white/50 truncate">
                                    {playlist.artists.join(", ")}
                                </p>
                            </button>
                        )
                    })}
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-8">
                        <Button
                            variant="outline"
                            onClick={() => setOffset(Math.max(0, offset - ITEMS_PER_PAGE))}
                            disabled={offset === 0}
                        >
                            Previous
                        </Button>
                        <span className="text-white/50">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            onClick={() => setOffset(offset + ITEMS_PER_PAGE)}
                            disabled={offset + ITEMS_PER_PAGE >= total}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}

const SpotifyAddView = () => {
    return (
        <PlayerLayout>
            <SpotifyAddContent />
        </PlayerLayout>
    )
}

export default SpotifyAddView
