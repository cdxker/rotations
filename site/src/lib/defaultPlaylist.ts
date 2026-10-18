import type { FuckingPlaylist, FuckingTrack, PlaylistId, TrackId } from "@/shared/types"

// Write-Only Log, the Music Lab album. Seeded into every library and played when nothing else is saved.
// Audio lives on the album's own Worker; URLs stay absolute because /api/audio/proxy fetches them server side.
const BASE = "https://write-only-log.devi-9d2.workers.dev"
const ARTISTS = ["Denzell"]

export const DEFAULT_PLAYLIST_ID: PlaylistId = "play-write-only-log"

// [file key, title, duration ms]
const TRACKS: [string, string, number][] = [
    ["01-oui-madame.mp3", "Oui, Madame", 195200],
    ["02-it-will-lose.mp3", "It Will Lose", 224520],
    ["03-finish-being-here.mp3", "Finish Being Here", 248000],
    ["04-new-year-state-of-mind.mp3", "New Year State of Mind", 277480],
    ["05-what-do-you-consume.mp3", "What Do You Consume?", 210800],
    ["06-no-panic.mp3", "No Panic", 162320],
    ["07-write-only-log.mp3", "Write-Only Log", 284000],
    ["08-squeeze.mp3", "Squeeze", 217200],
    ["09-eight-months-in-an-envelope.mp3", "Eight Months in an Envelope", 222640],
    ["10-read-this-one.mp3", "Read This One", 197150],
    ["11-stockholm.mp3", "Stockholm", 206800],
    ["12-two-ls.mp3", "Two Ls", 205450],
    ["13-i-hope-this-helps.mp3", "I Hope This Helps", 253600],
    ["14-signed.mp3", "Signed", 190320],
    ["15-siren.mp3", "Siren", 252800],
    ["16-he-remembers.mp3", "He Remembers", 128700],
    ["17-the-jury.mp3", "The Jury", 177500],
    ["18-strings.mp3", "Strings", 206300],
    ["19-card-on-file.mp3", "Card On File", 209400],
    ["20-skip-permissions.mp3", "Skip Permissions", 155900],
    ["21-higher-ups.mp3", "Higher Ups", 196000],
    ["22-choose-your-rock-bottom.mp3", "Choose Your Rock Bottom", 397640],
    ["23-make-it-forty-three.mp3", "Make It Forty-Three", 267920],
    ["24-wide-in-the-dark.mp3", "Wide in the Dark", 253210],
    ["25-the-only-thing.mp3", "The Only Thing", 196800],
    ["26-dreams.mp3", "Dreams", 294060],
    ["27-enter-prompt-below.mp3", "Enter Prompt Below", 210060],
    ["28-make-a-song.mp3", "Make a Song", 196260],
    ["29-stay-a-little-longer.mp3", "Stay a Little Longer", 125220],
    ["30-hands-over-hands.mp3", "Hands Over Hands", 130800],
    ["31-show-me-getting-better.mp3", "Show Me Getting Better", 183660],
    ["32-the-room-is-allowed-to-empty.mp3", "The Room Is Allowed to Empty", 302880],
]

export const defaultTracks: FuckingTrack[] = TRACKS.map(([key, name, time_ms]) => ({
    id: `track-write-only-log-${key.slice(0, 2)}` as TrackId,
    time_ms,
    name,
    artists: ARTISTS,
    audio: { type: "stream" as const, url: `${BASE}/t/${key}` },
}))

for (let i = 0; i < defaultTracks.length - 1; i++) {
    defaultTracks[i].next_tracks = { [DEFAULT_PLAYLIST_ID]: defaultTracks[i + 1].id }
}

export const defaultPlaylist: FuckingPlaylist = {
    id: DEFAULT_PLAYLIST_ID,
    track_cover_uri: `${BASE}/cover.jpg`,
    name: "Write-Only Log",
    artists: ARTISTS,
    first_track: defaultTracks[0],
    totalDurationMs: defaultTracks.reduce((acc, t) => acc + t.time_ms, 0),
    source: null,
}
