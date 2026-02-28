import { useEffect, useState } from "react";
import Graph from "graphology";

const GRAPH_API_BASE =
    typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "/api/graph";

interface GraphNodeData {
    name: string;
    artists: string[];
    albumName?: string;
    totalPlays: number;
    pageRank?: number;
    clusterId?: number;
    next: Record<string, number>;
    previous: Record<string, number>;
}

interface GraphApiResponse {
    nodes: Record<string, GraphNodeData>;
    metadata: {
        totalScrobbles: number;
        dateRange: { from: string; to: string };
    };
}

/** Cluster color palette matching chart-1 through chart-5 CSS variables (dark mode). */
const CLUSTER_COLORS = [
    "#7C3AED", // chart-1: purple
    "#22D3EE", // chart-2: cyan
    "#F59E0B", // chart-3: orange-yellow
    "#A855F7", // chart-4: lighter purple
    "#EF4444", // chart-5: red
];

export function getClusterColor(clusterId: number): string {
    return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length]!;
}

/** Compute node radius from play count using log scale. */
function nodeSize(totalPlays: number, maxPlays: number): number {
    if (maxPlays <= 1) return 4;
    return 4 + 16 * Math.log(totalPlays) / Math.log(maxPlays);
}

export type LoadState = "loading" | "loaded" | "error" | "mock";

/**
 * Fetch graph data from the API and build a graphology Graph.
 * Falls back to mock data if the API is unreachable.
 */
export function useGraphData(): { graph: Graph | null; state: LoadState; error: string | null } {
    const [graph, setGraph] = useState<Graph | null>(null);
    const [state, setState] = useState<LoadState>("loading");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const res = await fetch(`${GRAPH_API_BASE}/graph`);
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const data: GraphApiResponse = await res.json();

                if (cancelled) return;

                const g = buildGraphologyGraph(data);
                setGraph(g);
                setState("loaded");
            } catch {
                if (cancelled) return;
                // Fall back to mock data
                const g = buildMockGraph();
                setGraph(g);
                setState("mock");
                setError("Could not reach graph API — showing mock data");
            }
        }

        load();
        return () => { cancelled = true; };
    }, []);

    return { graph, state, error };
}

function buildGraphologyGraph(data: GraphApiResponse): Graph {
    const g = new Graph();
    const entries = Object.entries(data.nodes);
    const maxPlays = Math.max(...entries.map(([, n]) => n.totalPlays), 1);

    // Add nodes
    for (const [key, node] of entries) {
        g.addNode(key, {
            label: `${node.artists[0]} — ${node.name}`,
            size: nodeSize(node.totalPlays, maxPlays),
            color: getClusterColor(node.clusterId ?? 0),
            totalPlays: node.totalPlays,
            pageRank: node.pageRank ?? 0,
            clusterId: node.clusterId ?? 0,
            // Random initial positions — ForceAtlas2 will arrange them
            x: Math.random() * 1000,
            y: Math.random() * 1000,
        });
    }

    // Add edges
    for (const [fromKey, node] of entries) {
        for (const [toKey, weight] of Object.entries(node.next)) {
            if (g.hasNode(toKey) && !g.hasEdge(fromKey, toKey)) {
                g.addEdge(fromKey, toKey, {
                    weight,
                    size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
                    color: `rgba(255, 255, 255, ${Math.min(0.3, 0.05 + weight * 0.03)})`,
                });
            }
        }
    }

    return g;
}

/** Generate a mock graph for development without the API. */
function buildMockGraph(): Graph {
    const g = new Graph();

    const artists = [
        "Radiohead", "Nirvana", "Pink Floyd", "The Beatles", "Led Zeppelin",
        "David Bowie", "Tame Impala", "Arctic Monkeys", "The Strokes", "Daft Punk",
        "Aphex Twin", "Boards of Canada", "Portishead", "Massive Attack", "Bjork",
    ];
    const tracks = [
        "Creep", "Paranoid Android", "Karma Police", "Everything In Its Right Place",
        "Smells Like Teen Spirit", "Come As You Are", "Lithium",
        "Comfortably Numb", "Wish You Were Here", "Time",
        "Let It Be", "Yesterday", "Hey Jude",
        "Stairway to Heaven", "Whole Lotta Love",
        "Heroes", "Space Oddity", "Life on Mars",
        "Let It Happen", "The Less I Know The Better",
        "Do I Wanna Know", "R U Mine",
        "Last Nite", "Reptilia",
        "Get Lucky", "Around the World",
        "Windowlicker", "Avril 14th",
        "Roygbiv", "Dayvan Cowboy",
        "Sour Times", "Glory Box",
        "Teardrop", "Angel",
        "Army of Me", "Hyperballad",
    ];

    const nodes: Array<{ key: string; artist: string; track: string; plays: number; cluster: number }> = [];
    for (let i = 0; i < tracks.length; i++) {
        const artist = artists[i % artists.length]!;
        const track = tracks[i]!;
        const key = `${artist.toLowerCase()}::${track.toLowerCase()}`;
        const cluster = i % 5;
        const plays = Math.floor(Math.random() * 200) + 1;
        nodes.push({ key, artist, track, plays, cluster });
    }

    const maxPlays = Math.max(...nodes.map((n) => n.plays));

    for (const node of nodes) {
        g.addNode(node.key, {
            label: `${node.artist} — ${node.track}`,
            size: nodeSize(node.plays, maxPlays),
            color: getClusterColor(node.cluster),
            totalPlays: node.plays,
            pageRank: Math.random() * 0.01,
            clusterId: node.cluster,
            x: Math.random() * 1000,
            y: Math.random() * 1000,
        });
    }

    // Add edges — connect sequential and some random cross-cluster
    for (let i = 0; i < nodes.length - 1; i++) {
        const weight = Math.floor(Math.random() * 5) + 1;
        g.addEdge(nodes[i]!.key, nodes[i + 1]!.key, {
            weight,
            size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
            color: `rgba(255, 255, 255, ${Math.min(0.3, 0.05 + weight * 0.03)})`,
        });
    }
    // Random cross-edges
    for (let i = 0; i < 30; i++) {
        const a = nodes[Math.floor(Math.random() * nodes.length)]!;
        const b = nodes[Math.floor(Math.random() * nodes.length)]!;
        if (a.key !== b.key && !g.hasEdge(a.key, b.key)) {
            const weight = Math.floor(Math.random() * 3) + 1;
            g.addEdge(a.key, b.key, {
                weight,
                size: Math.max(0.5, Math.min(3, Math.log(weight + 1))),
                color: `rgba(255, 255, 255, ${Math.min(0.3, 0.05 + weight * 0.03)})`,
            });
        }
    }

    return g;
}
