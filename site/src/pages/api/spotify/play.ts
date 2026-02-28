import type { APIRoute } from "astro"
import { type } from "arktype"
import { getSpotifyAccessToken, errorResponse } from "@/lib/server"

const playRequestSchema = type({
    device_id: "string",
    context_uri: "string",
    offset: type({ uri: "string" }).or({ position: "number" }),
    "position_ms?": "number",
})

export const PUT: APIRoute = async ({ request }) => {
    const accessToken = await getSpotifyAccessToken(request)
    if (!accessToken) {
        return errorResponse("Not authenticated", 401)
    }

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return errorResponse("Invalid JSON body", 400)
    }

    const result = playRequestSchema(body)
    if (result instanceof type.errors) {
        return errorResponse(`Invalid request body: ${result.summary}`, 400)
    }

    const { device_id, context_uri, offset, position_ms } = result

    const playResponse = await fetch(
        `https://api.spotify.com/v1/me/player/play${device_id ? `?device_id=${device_id}` : ""}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ context_uri, offset, position_ms }),
        }
    )

    if (!playResponse.ok && playResponse.status !== 204) {
        const responsBody = await playResponse.text()
        return errorResponse("Failed to start playback " + responsBody, playResponse.status)
    }

    return new Response(null, { status: 204 })
}
