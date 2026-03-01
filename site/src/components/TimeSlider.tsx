import { usePlayer } from "@/hooks/PlayerContext"
import { FastForward, Pause, Play, Rewind, SkipBack, SkipForward } from "lucide-react"
import { formatTime } from "@/lib/utils"
import * as Slider from "@radix-ui/react-slider"
import { SpotifyStatus } from "./SpotifyStatus"
import { Button } from "./ui/button"
import { AddBandcampButton } from "./AddMusicButton"
import { navigate } from "astro:transitions/client"

export interface TimeSliderProps {
    expanded: boolean
    onViewChange?: (view: "player" | "playlists" | "spotify-add") => void
}

export const TimeSlider = ({ expanded, onViewChange }: TimeSliderProps) => {
    const {
        totalDuration,
        handleSeek,
        currentTimeMs,
        isPlaying,
        togglePlayPause,
        handleNextTrack,
        handlePrevTrack,
    } = usePlayer()

    return (
        <div className="max-w-screen z-20 sticky bottom-0 text-white w-full flex flex-col">
            <div className="bg-[#0B0B0B] flex flex-row space-y-0 flex-wrap items-center justify-center gap-2 p-4 text-xs lg:text-base lg:space-y-2 lg:absolute lg:left-4 lg:bottom-4 lg:flex-col lg:flex-nowrap lg:items-start lg:gap-0 lg:pt-2 lg:px-0 lg:pb-0 lg:bg-transparent">
                {!expanded && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="lg:size-default"
                        onClick={() =>
                            onViewChange ? onViewChange("playlists") : navigate("/more")
                        }
                    >
                        View full rotation
                    </Button>
                )}
                {expanded && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => (onViewChange ? onViewChange("player") : navigate("/"))}
                    >
                        Return to Player
                    </Button>
                )}
                <div className="flex gap-2 items-center lg:flex-col lg:items-start">
                    <SpotifyStatus
                        onNavigate={onViewChange ? () => onViewChange("spotify-add") : undefined}
                    />
                    <AddBandcampButton text="Add Album" />
                </div>
            </div>
            <div className="bg-[#0B0B0B] flex flex-col md:flex-row items-center justify-center">
                <div className="mb-8 self-center w-full max-w-2xl">
                    <Slider.Root
                        className="relative flex items-center select-none touch-none w-full h-5"
                        value={[currentTimeMs]}
                        max={totalDuration}
                        step={1000}
                        onValueChange={([value]) => handleSeek(value)}
                    >
                        <Slider.Track className="bg-[#6B8CC7] relative grow rounded-full h-2">
                            <Slider.Range className="absolute bg-[#3B5998] rounded-full h-full" />
                        </Slider.Track>
                        <Slider.Thumb className="block w-3 h-3 bg-[#E85A4F] rounded-full focus:outline-none" />
                    </Slider.Root>

                    <div className="flex justify-between mt-2 text-white/70 z-20 text-sm">
                        <span className="bg-[radial-gradient(circle,#0B0B0B_0%,rgba(11,11,11,0.6)_50%,rgba(11,11,11,0.1)_100%)] z-20 text-sm">
                            {formatTime(currentTimeMs)}
                        </span>
                        <span className="bg-[radial-gradient(circle,#0B0B0B_0%,rgba(11,11,11,0.6)_50%,rgba(11,11,11,0.1)_100%)] z-20 text-sm">
                            {formatTime(totalDuration)}
                        </span>
                    </div>
                    <div className="flex items-center justify-center space-x-3">
                        <SkipBack
                            color="#fff"
                            className="cursor-pointer"
                            onClick={handlePrevTrack}
                        />
                        {/* <Rewind color="#fff" />*/}
                        <div
                            className="rounded-full bg-white text-black px-2 py-2 cursor-pointer"
                            onClick={togglePlayPause}
                        >
                            {!isPlaying && <Play />}
                            {isPlaying && <Pause />}
                        </div>
                        {/*<FastForward color="#fff" />*/}
                        <SkipForward
                            color="#fff"
                            className="cursor-pointer"
                            onClick={handleNextTrack}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
