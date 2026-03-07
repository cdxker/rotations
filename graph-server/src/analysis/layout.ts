import type { SongKey, ListeningGraph } from "../graph/types.js";

export type LayoutMode = "pagerank" | "mds" | "weighted-mds";

export interface Position {
    x: number;
    y: number;
}

export type PositionMap = Record<SongKey, Position>;

export interface AllPositions {
    pagerank: PositionMap;
    mds: PositionMap;
    "weighted-mds": PositionMap;
}

/** Compute all three layout positions for a graph. */
export function computeAllLayouts(graph: ListeningGraph): AllPositions {
    const keys = Object.keys(graph.nodes) as SongKey[];
    return {
        pagerank: computePageRankLayout(graph, keys),
        mds: computeMdsLayout(graph, keys),
        "weighted-mds": computeWeightedMdsLayout(graph, keys),
    };
}

// ---------------------------------------------------------------------------
// PageRank radial layout
// ---------------------------------------------------------------------------

function hashAngle(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return ((hash % 10000) / 10000) * Math.PI * 2;
}

function computePageRankLayout(
    graph: ListeningGraph,
    keys: SongKey[],
): PositionMap {
    const result: PositionMap = {} as PositionMap;
    if (keys.length === 0) return result;

    let maxPageRank = 1e-10;
    for (const key of keys) {
        const pr = graph.nodes[key]?.pageRank ?? 0;
        if (pr > maxPageRank) maxPageRank = pr;
    }

    for (const key of keys) {
        const importance = (graph.nodes[key]?.pageRank ?? 0) / maxPageRank;
        const angle = hashAngle(key);
        const radius = Math.pow(1 - importance, 2) * 500;
        result[key] = {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
        };
    }

    return result;
}

// ---------------------------------------------------------------------------
// Classical MDS on all-pairs shortest-path hop distances
// ---------------------------------------------------------------------------

function computeMdsLayout(
    graph: ListeningGraph,
    keys: SongKey[],
): PositionMap {
    const n = keys.length;
    if (n === 0) return {} as PositionMap;

    const keyIndex = new Map<SongKey, number>();
    for (let i = 0; i < n; i++) keyIndex.set(keys[i]!, i);

    // All-pairs shortest path via BFS (undirected hops)
    const adj = buildUndirectedAdj(graph, keys, keyIndex);
    const dist = new Float64Array(n * n);
    dist.fill(Infinity);
    for (let i = 0; i < n; i++) {
        dist[i * n + i] = 0;
        bfsSingleSource(i, n, adj, dist);
    }

    return mdsFromDistances(keys, dist, n);
}

function buildUndirectedAdj(
    graph: ListeningGraph,
    keys: SongKey[],
    keyIndex: Map<SongKey, number>,
): number[][] {
    const n = keys.length;
    const adj: number[][] = new Array(n);
    for (let i = 0; i < n; i++) adj[i] = [];

    for (const key of keys) {
        const node = graph.nodes[key]!;
        const si = keyIndex.get(key)!;
        for (const toKey of Object.keys(node.next) as SongKey[]) {
            const ti = keyIndex.get(toKey);
            if (ti === undefined) continue;
            adj[si]!.push(ti);
            adj[ti]!.push(si);
        }
    }

    return adj;
}

function bfsSingleSource(
    src: number,
    n: number,
    adj: number[][],
    dist: Float64Array,
): void {
    const queue: number[] = [src];
    let head = 0;
    while (head < queue.length) {
        const u = queue[head++]!;
        const d = dist[src * n + u];
        for (const v of adj[u]!) {
            if (dist[src * n + v] === Infinity) {
                dist[src * n + v] = d + 1;
                queue.push(v);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Weighted MDS (Dijkstra with 1/weight distances, log-scaled)
// ---------------------------------------------------------------------------

function computeWeightedMdsLayout(
    graph: ListeningGraph,
    keys: SongKey[],
): PositionMap {
    const n = keys.length;
    if (n === 0) return {} as PositionMap;

    const keyIndex = new Map<SongKey, number>();
    for (let i = 0; i < n; i++) keyIndex.set(keys[i]!, i);

    // Build adjacency with distance = 1/weight (undirected, keep shortest)
    const adj: Map<number, Map<number, number>> = new Map();
    for (let i = 0; i < n; i++) adj.set(i, new Map());

    for (const key of keys) {
        const node = graph.nodes[key]!;
        const si = keyIndex.get(key)!;
        for (const [toKeyStr, weight] of Object.entries(node.next)) {
            const toKey = toKeyStr as SongKey;
            const ti = keyIndex.get(toKey);
            if (ti === undefined) continue;
            const d = 1 / (weight || 1);
            const fwd = adj.get(si)!;
            const bwd = adj.get(ti)!;
            fwd.set(ti, Math.min(fwd.get(ti) ?? Infinity, d));
            bwd.set(si, Math.min(bwd.get(si) ?? Infinity, d));
        }
    }

    // All-pairs Dijkstra
    const dist = new Float64Array(n * n);
    dist.fill(Infinity);
    for (let i = 0; i < n; i++) {
        dist[i * n + i] = 0;
        dijkstraSingleSource(i, n, adj, dist);
    }

    // Log-scale distances
    for (let k = 0; k < n * n; k++) {
        if (dist[k] > 0 && isFinite(dist[k])) {
            dist[k] = Math.log1p(dist[k]);
        }
    }

    const positions = mdsFromDistances(keys, dist, n);

    // Post-process: push overlapping nodes apart
    spreadOverlappingNodes(positions, keys, 30);

    return positions;
}

function dijkstraSingleSource(
    src: number,
    n: number,
    adj: Map<number, Map<number, number>>,
    dist: Float64Array,
): void {
    const visited = new Uint8Array(n);
    dist[src * n + src] = 0;

    for (let step = 0; step < n; step++) {
        let u = -1;
        let best = Infinity;
        for (let i = 0; i < n; i++) {
            if (!visited[i] && dist[src * n + i] < best) {
                best = dist[src * n + i];
                u = i;
            }
        }
        if (u === -1) break;
        visited[u] = 1;

        const neighbors = adj.get(u);
        if (!neighbors) continue;
        for (const [v, w] of neighbors) {
            const alt = best + w;
            if (alt < dist[src * n + v]) {
                dist[src * n + v] = alt;
            }
        }
    }
}

function spreadOverlappingNodes(
    positions: PositionMap,
    keys: SongKey[],
    minDist: number,
): void {
    const n = keys.length;
    if (n < 2) return;

    const ITERATIONS = 50;
    const STRENGTH = 0.5;

    for (let iter = 0; iter < ITERATIONS; iter++) {
        let anyOverlap = false;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = positions[keys[i]!]!;
                const b = positions[keys[j]!]!;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDist) {
                    anyOverlap = true;
                    const overlap = minDist - d;
                    const push = (overlap * STRENGTH) / 2;
                    const nx = d > 0.001 ? dx / d : Math.cos(i + j);
                    const ny = d > 0.001 ? dy / d : Math.sin(i + j);
                    a.x -= nx * push;
                    a.y -= ny * push;
                    b.x += nx * push;
                    b.y += ny * push;
                }
            }
        }
        if (!anyOverlap) break;
    }

    // Re-center around origin
    let cx = 0,
        cy = 0;
    for (const key of keys) {
        cx += positions[key]!.x;
        cy += positions[key]!.y;
    }
    cx /= n;
    cy /= n;
    for (const key of keys) {
        positions[key]!.x -= cx;
        positions[key]!.y -= cy;
    }
}

// ---------------------------------------------------------------------------
// Shared: Classical MDS from precomputed distance matrix
// ---------------------------------------------------------------------------

function mdsFromDistances(
    keys: SongKey[],
    dist: Float64Array,
    n: number,
): PositionMap {
    // Replace Infinity with large finite value
    let maxFinite = 1;
    for (let k = 0; k < n * n; k++) {
        if (isFinite(dist[k]) && dist[k] > maxFinite) maxFinite = dist[k];
    }
    const infReplace = maxFinite + 1;
    for (let k = 0; k < n * n; k++) {
        if (!isFinite(dist[k])) dist[k] = infReplace;
    }

    // Classical MDS (double-centering on squared distances)
    const dsq = new Float64Array(n * n);
    for (let k = 0; k < n * n; k++) dsq[k] = dist[k] * dist[k];

    const rowMean = new Float64Array(n);
    const colMean = new Float64Array(n);
    let grandMean = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            rowMean[i] += dsq[i * n + j];
            colMean[j] += dsq[i * n + j];
        }
    }
    for (let i = 0; i < n; i++) {
        rowMean[i] /= n;
        colMean[i] /= n;
        grandMean += rowMean[i];
    }
    grandMean /= n;

    const B = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            B[i * n + j] =
                -0.5 * (dsq[i * n + j] - rowMean[i] - colMean[j] + grandMean);
        }
    }

    const coords = powerIterationTop2(B, n);

    const result: PositionMap = {} as PositionMap;
    for (let i = 0; i < n; i++) {
        result[keys[i]!] = { x: coords.x[i], y: coords.y[i] };
    }
    return result;
}

function powerIterationTop2(
    M: Float64Array,
    n: number,
): { x: Float64Array; y: Float64Array } {
    const MAX_ITER = 300;
    const TOL = 1e-9;

    function topEigen(
        mat: Float64Array,
    ): { value: number; vector: Float64Array } {
        let v = new Float64Array(n);
        for (let i = 0; i < n; i++) v[i] = Math.sin(i * 0.7 + 1.3);
        vecNormalize(v);

        let eigenvalue = 0;
        for (let iter = 0; iter < MAX_ITER; iter++) {
            const Mv = matVec(mat, v, n);
            eigenvalue = vecDot(v, Mv, n);
            vecNormalize(Mv);
            const diff = maxAbsDiff(Mv, v, n);
            v = Mv as Float64Array<ArrayBuffer>;
            if (diff < TOL) break;
        }
        return { value: eigenvalue, vector: v };
    }

    const e1 = topEigen(M);

    // Deflate: M' = M - λ₁ v₁ v₁ᵀ
    const deflated = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            deflated[i * n + j] =
                M[i * n + j] - e1.value * e1.vector[i] * e1.vector[j];
        }
    }

    const e2 = topEigen(deflated);

    const sx = Math.sqrt(Math.max(0, e1.value));
    const sy = Math.sqrt(Math.max(0, e2.value));

    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        x[i] = e1.vector[i] * sx;
        y[i] = e2.vector[i] * sy;
    }

    return { x, y };
}

function matVec(M: Float64Array, v: Float64Array, n: number): Float64Array {
    const result = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += M[i * n + j] * v[j];
        result[i] = sum;
    }
    return result;
}

function vecDot(a: Float64Array, b: Float64Array, n: number): number {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
}

function vecNormalize(v: Float64Array): void {
    let norm = 0;
    for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
}

function maxAbsDiff(a: Float64Array, b: Float64Array, n: number): number {
    let max = 0;
    for (let i = 0; i < n; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > max) max = d;
    }
    return max;
}
