import { useEffect, useState } from "react"
import Graph from "graphology"
import { fetchGraph, toGraphology, nodeBrightness, nodeSize } from "@/lib/graph-api"

export type LoadState = "loading" | "loaded" | "error" | "mock"

/**
 * Fetch graph data from the API and build a graphology Graph.
 * Falls back to mock data if the API is unreachable.
 */
export function useGraphData(): { graph: Graph | null; state: LoadState; error: string | null } {
    const [graph, setGraph] = useState<Graph | null>(null)
    const [state, setState] = useState<LoadState>("loading")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                const data = await fetchGraph()
                if (cancelled) return

                const g = toGraphology(data)
                setGraph(g)
                setState("loaded")
            } catch {
                if (cancelled) return
                // Fall back to mock data
                const g = buildMockGraph()
                setGraph(g)
                setState("mock")
                setError("Could not reach graph API — showing mock data")
            }
        }

        load()
        return () => {
            cancelled = true
        }
    }, [])

    return { graph, state, error }
}

/** Generate a mock graph for development without the API. */
function buildMockGraph(): Graph {
    const g = new Graph()

    const artists = [
        "Radiohead",
        "Nirvana",
        "Pink Floyd",
        "The Beatles",
        "Led Zeppelin",
        "David Bowie",
        "Tame Impala",
        "Arctic Monkeys",
        "The Strokes",
        "Daft Punk",
        "Aphex Twin",
        "Boards of Canada",
        "Portishead",
        "Massive Attack",
        "Bjork",
    ]
    const tracks = [
        "Creep",
        "Paranoid Android",
        "Karma Police",
        "Everything In Its Right Place",
        "Smells Like Teen Spirit",
        "Come As You Are",
        "Lithium",
        "Comfortably Numb",
        "Wish You Were Here",
        "Time",
        "Let It Be",
        "Yesterday",
        "Hey Jude",
        "Stairway to Heaven",
        "Whole Lotta Love",
        "Heroes",
        "Space Oddity",
        "Life on Mars",
        "Let It Happen",
        "The Less I Know The Better",
        "Do I Wanna Know",
        "R U Mine",
        "Last Nite",
        "Reptilia",
        "Get Lucky",
        "Around the World",
        "Windowlicker",
        "Avril 14th",
        "Roygbiv",
        "Dayvan Cowboy",
        "Sour Times",
        "Glory Box",
        "Teardrop",
        "Angel",
        "Army of Me",
        "Hyperballad",
    ]

    const nodes: Array<{
        key: string
        artist: string
        track: string
        plays: number
        cluster: number
    }> = []
    for (let i = 0; i < tracks.length; i++) {
        const artist = artists[i % artists.length]!
        const track = tracks[i]!
        const key = `${artist.toLowerCase()}::${track.toLowerCase()}`
        const cluster = i % 5
        const plays = Math.floor(Math.random() * 200) + 1
        nodes.push({ key, artist, track, plays, cluster })
    }

    const maxPlays = Math.max(...nodes.map((n) => n.plays))

    for (const node of nodes) {
        const pageRank = Math.random() * 0.01
        const importance = pageRank / 0.01
        g.addNode(node.key, {
            label: `${node.artist} — ${node.track}`,
            artists: [node.artist],
            size: nodeSize(node.plays, maxPlays),
            color: nodeBrightness(importance),
            totalPlays: node.plays,
            pageRank,
            clusterId: node.cluster,
            sources: ["lastfm"],
            x: Math.random() * 1000,
            y: Math.random() * 1000,
        })
    }

    // Add edges — opacity encodes weight
    for (let i = 0; i < nodes.length - 1; i++) {
        const weight = Math.floor(Math.random() * 5) + 1
        g.addEdge(nodes[i]!.key, nodes[i + 1]!.key, {
            weight,
            size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
            color: `rgba(255, 255, 255, ${Math.min(0.25, 0.03 + weight * 0.02)})`,
        })
    }
    // Random cross-edges
    for (let i = 0; i < 30; i++) {
        const a = nodes[Math.floor(Math.random() * nodes.length)]!
        const b = nodes[Math.floor(Math.random() * nodes.length)]!
        if (a.key !== b.key && !g.hasEdge(a.key, b.key)) {
            const weight = Math.floor(Math.random() * 3) + 1
            g.addEdge(a.key, b.key, {
                weight,
                size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
                color: `rgba(255, 255, 255, ${Math.min(0.25, 0.03 + weight * 0.02)})`,
            })
        }
    }

    return g
}
