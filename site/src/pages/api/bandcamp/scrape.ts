import type { APIRoute } from "astro"
import type {
    BandcampPageData,
    PlaylistId,
    FuckingPlaylist,
    FuckingTrack,
    TrackId,
} from "../../../shared/types"

function extractBandcampData(
    html: string,
    fallbackUrl: string
): { success: true; pageData: BandcampPageData } | { success: false; message: string } {
    const tralbumMatch = html.match(/data-tralbum="([^"]*)"/)
    if (!tralbumMatch) {
        return { success: false, message: "Could not extract track data from Bandcamp page" }
    }

    const tralbumDataStr = tralbumMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")

    let tralbumData: Record<string, any>
    try {
        tralbumData = JSON.parse(tralbumDataStr)
    } catch (e) {
        console.error("Failed to parse tralbum data:", e)
        return { success: false, message: "Failed to parse tralbum data" }
    }

    let ldJson: Record<string, any> | null = null
    const ldJsonMatch = html.match(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/
    )
    if (ldJsonMatch) {
        try {
            ldJson = JSON.parse(ldJsonMatch[1])
        } catch (e) {
            return { success: false, message: "Failed to parse ld+json" }
        }
    }

    let albumArt: string | null = null
    const artMatch = html.match(/<a[^>]*class="popupImage"[^>]*href="([^"]*)"/)
    if (artMatch) {
        albumArt = artMatch[1]
    } else {
        const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/)
        if (ogImageMatch) {
            albumArt = ogImageMatch[1]
        }
    }

    if (!ldJson) {
        return { success: false, message: "Could not extract ld+json from Bandcamp page" }
    }

    if (!albumArt) {
        return { success: false, message: "Could not extract album art from Bandcamp page" }
    }

    const pageData: BandcampPageData = {
        artist: tralbumData.artist || tralbumData.current?.artist || "Unknown Artist",
        trackinfo: tralbumData.trackinfo,
        url: tralbumData.url || fallbackUrl,
        current: tralbumData.current,
        albumArt: albumArt,
        keywords: [],
    }

    return { success: true, pageData }
}

function transformBandcampToFuckingPlaylist(pageData: BandcampPageData): {
    playlist: FuckingPlaylist
    tracks: FuckingTrack[]
} {
    const albumTitle = pageData.current?.title || pageData.trackinfo[0]?.title || "Unknown Album"
    const artist = pageData.artist || "Unknown Artist"
    const keywords = pageData.keywords || []

    const urlSlug = pageData.url
        .replace(/https?:\/\//, "")
        .replace(/\.bandcamp\.com/, "")
        .replace(/\//g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "")

    const playlistId: PlaylistId = `play-${urlSlug}`

    const tracks: FuckingTrack[] = pageData.trackinfo
        .filter((t) => t.file?.["mp3-128"]) // Only include tracks with available audio
        .map((trackInfo, index) => {
            const trackId: TrackId = `track-${trackInfo.track_id || index + 1}`

            let streamUrl = trackInfo.file?.["mp3-128"]
            if (streamUrl && !streamUrl.startsWith("http")) {
                streamUrl = "https:" + streamUrl
            }

            return {
                id: trackId,
                time_ms: Math.round((trackInfo.duration || 0) * 1000),
                name: trackInfo.title,
                artists: [trackInfo.artist || artist],
                tags: keywords.length > 0 ? keywords : undefined,
                audio: { type: "stream" as const, url: streamUrl ?? "" },
            }
        })

    for (let i = 0; i < tracks.length - 1; i++) {
        tracks[i].next_tracks = {
            [playlistId]: tracks[i + 1].id,
        }
    }

    const playlist: FuckingPlaylist = {
        id: playlistId,
        track_cover_uri: pageData.albumArt || "",
        name: albumTitle,
        artists: [artist],
        first_track: tracks[0],
        totalDurationMs: tracks.reduce((acc, t) => acc + t.time_ms, 0),
        source: "bandcamp",
    }

    return { playlist, tracks }
}

export const GET: APIRoute = async ({ url }) => {
    const bandcampUrl = url.searchParams.get("url")

    if (!bandcampUrl) {
        return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    }

    if (!bandcampUrl.includes("bandcamp.com")) {
        return new Response(JSON.stringify({ error: "URL must be a Bandcamp URL" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        })
    }

    try {
        const response = await fetch(bandcampUrl, {})
        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`)
        }
        const html = await response.text()

        const extracted = extractBandcampData(html, bandcampUrl)
        if (extracted.success == false) {
            return new Response(JSON.stringify({ error: extracted.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            })
        }

        const result = transformBandcampToFuckingPlaylist(extracted.pageData)

        return new Response(JSON.stringify(result, null, 2), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })
    } catch (error) {
        console.error("Error scraping Bandcamp:", error)
        return new Response(
            JSON.stringify({
                error: "Failed to scrape Bandcamp page",
                details: error instanceof Error ? error.message : String(error),
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        )
    }
}
