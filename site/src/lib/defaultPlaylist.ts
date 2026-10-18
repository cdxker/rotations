import type { FuckingPlaylist, FuckingTrack, PlaylistId, TrackId } from "@/shared/types"

// Write-Only Log, the Music Lab album. Seeded into every library and played when nothing else is saved.
// Audio lives on the album's own Worker; URLs stay absolute because /api/audio/proxy fetches them server side.
const BASE = "https://write-only-log.devi-9d2.workers.dev"
const ARTISTS = ["Denzell"]

export const DEFAULT_PLAYLIST_ID: PlaylistId = "play-write-only-log"

// [file key, title, duration ms]
const TRACKS: [string, string, number][] = [
    ["01-come-back.mp3", "Come Back", 180240],
    ["02-oui-madame.mp3", "Oui, Madame", 195200],
    ["03-it-will-lose.mp3", "It Will Lose", 224520],
    ["04-finish-being-here.mp3", "Finish Being Here", 248000],
    ["05-new-year-state-of-mind.mp3", "New Year State of Mind", 277480],
    ["06-what-do-you-consume.mp3", "What Do You Consume?", 210800],
    ["07-no-panic.mp3", "No Panic", 162320],
    ["08-write-only-log.mp3", "Write-Only Log", 284000],
    ["09-squeeze.mp3", "Squeeze", 217200],
    ["10-eight-months-in-an-envelope.mp3", "Eight Months in an Envelope", 222640],
    ["11-read-this-one.mp3", "Read This One", 197150],
    ["12-stockholm.mp3", "Stockholm", 206800],
    ["13-two-ls.mp3", "Two Ls", 205450],
    ["14-i-hope-this-helps.mp3", "I Hope This Helps", 253600],
    ["15-signed.mp3", "Signed", 190320],
    ["16-siren.mp3", "Siren", 252800],
    ["17-he-remembers.mp3", "He Remembers", 128700],
    ["18-the-jury.mp3", "The Jury", 177500],
    ["19-strings.mp3", "Strings", 206300],
    ["20-card-on-file.mp3", "Card On File", 209400],
    ["21-skip-permissions.mp3", "Skip Permissions", 155900],
    ["22-higher-ups.mp3", "Higher Ups", 196000],
    ["23-choose-your-rock-bottom.mp3", "Choose Your Rock Bottom", 397640],
    ["24-make-it-forty-three.mp3", "Make It Forty-Three", 267920],
    ["25-make-it-painful.mp3", "Make It Painful", 119100],
    ["26-skip-permissions-again.mp3", "Skip Permissions (AGAIN)", 159100],
    ["27-the-fix.mp3", "The Fix", 112500],
    ["28-hands-over-hands-again.mp3", "Hands Over Hands (AGAIN)", 172100],
    ["29-choose-your-rock-bottom-again.mp3", "Choose Your Rock Bottom (AGAIN)", 173740],
    ["30-pocket-of-keys.mp3", "Pocket of Keys", 157010],
    ["31-wide-in-the-dark.mp3", "Wide in the Dark", 253210],
    ["32-the-only-thing.mp3", "The Only Thing", 196800],
    ["33-dreams.mp3", "Dreams", 294060],
    ["34-enter-prompt-below.mp3", "Enter Prompt Below", 210060],
    ["35-make-a-song.mp3", "Make a Song", 196260],
    ["36-stay-a-little-longer.mp3", "Stay a Little Longer", 125220],
    ["37-hands-over-hands.mp3", "Hands Over Hands", 130800],
    ["38-looking-for-tenders.mp3", "Looking for Tenders", 200450],
    ["39-show-me-getting-better.mp3", "Show Me Getting Better", 183660],
    ["40-if-i-finish-this.mp3", "If I Finish This", 194140],
    ["41-take-it-literally.mp3", "Take It Literally", 297230],
    ["42-overwhelmed-not-sorry.mp3", "Overwhelmed, Not Sorry", 197000],
    ["43-the-room-is-allowed-to-empty.mp3", "The Room Is Allowed to Empty", 302880],
    ["44-go-home.mp3", "Go Home", 295060],
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
