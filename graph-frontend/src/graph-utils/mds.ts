import type Graph from "graphology"
import { singleSourceLength } from "graphology-shortest-path/unweighted"
import type { NodeAttributes, EdgeAttributes } from "#/lib/types"

/**
 * Compute 2D positions for graph nodes using Classical (Torgerson) MDS
 * on all-pairs shortest-path hop distances.
 */
export function calculateMdsPositions(
  graph: Graph<NodeAttributes, EdgeAttributes>,
): Map<string, { x: number; y: number }> {
  const keys = graph.nodes()
  const n = keys.length
  if (n === 0) return new Map()

  const keyIndex = new Map<string, number>()
  for (let i = 0; i < n; i++) keyIndex.set(keys[i], i)

  // --- 1. All-pairs shortest path (BFS, undirected hops) ---
  const dist = new Float64Array(n * n)
  dist.fill(Infinity)
  for (let i = 0; i < n; i++) dist[i * n + i] = 0

  for (let i = 0; i < n; i++) {
    const lengths = singleSourceLength(graph, keys[i])
    for (const [target, d] of Object.entries(lengths)) {
      const j = keyIndex.get(target)
      if (j !== undefined) {
        dist[i * n + j] = d
      }
    }
  }

  // Replace any remaining Infinity with a large finite value
  // (disconnected components) so MDS doesn't blow up.
  let maxFinite = 1
  for (let k = 0; k < n * n; k++) {
    if (isFinite(dist[k]) && dist[k] > maxFinite) maxFinite = dist[k]
  }
  const infReplace = maxFinite + 1
  for (let k = 0; k < n * n; k++) {
    if (!isFinite(dist[k])) dist[k] = infReplace
  }

  // --- 2. Classical MDS (double-centering on squared distances) ---
  const dsq = new Float64Array(n * n)
  for (let k = 0; k < n * n; k++) dsq[k] = dist[k] * dist[k]

  const rowMean = new Float64Array(n)
  const colMean = new Float64Array(n)
  let grandMean = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      rowMean[i] += dsq[i * n + j]
      colMean[j] += dsq[i * n + j]
    }
  }
  for (let i = 0; i < n; i++) {
    rowMean[i] /= n
    colMean[i] /= n
    grandMean += rowMean[i]
  }
  grandMean /= n

  // B = -0.5 * (D² - rowMean - colMean + grandMean)
  const B = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      B[i * n + j] =
        -0.5 * (dsq[i * n + j] - rowMean[i] - colMean[j] + grandMean)
    }
  }

  // --- 3. Extract top 2 eigenvectors via power iteration ---
  const coords = powerIterationTop2(B, n)

  // --- 4. Build result map ---
  const result = new Map<string, { x: number; y: number }>()
  for (let i = 0; i < n; i++) {
    result.set(keys[i], { x: coords.x[i], y: coords.y[i] })
  }
  return result
}

/** Extract top-2 eigenvectors of a symmetric matrix via power iteration + deflation. */
function powerIterationTop2(
  M: Float64Array,
  n: number,
): { x: Float64Array; y: Float64Array } {
  const MAX_ITER = 300
  const TOL = 1e-9

  function topEigen(
    mat: Float64Array,
  ): { value: number; vector: Float64Array } {
    let v = new Float64Array(n)
    for (let i = 0; i < n; i++) v[i] = Math.sin(i * 0.7 + 1.3)
    normalize(v)

    let eigenvalue = 0
    for (let iter = 0; iter < MAX_ITER; iter++) {
      const Mv = matVec(mat, v, n)
      eigenvalue = dot(v, Mv, n)
      normalize(Mv)
      const diff = maxAbsDiff(Mv, v, n)
      v = Mv as Float64Array<ArrayBuffer>
      if (diff < TOL) break
    }
    return { value: eigenvalue, vector: v }
  }

  const e1 = topEigen(M)

  // Deflate: M' = M - λ₁ v₁ v₁ᵀ
  const deflated = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      deflated[i * n + j] =
        M[i * n + j] - e1.value * e1.vector[i] * e1.vector[j]
    }
  }

  const e2 = topEigen(deflated)

  const sx = Math.sqrt(Math.max(0, e1.value))
  const sy = Math.sqrt(Math.max(0, e2.value))

  const x = new Float64Array(n)
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = e1.vector[i] * sx
    y[i] = e2.vector[i] * sy
  }

  return { x, y }
}

function matVec(M: Float64Array, v: Float64Array, n: number): Float64Array {
  const result = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = 0; j < n; j++) sum += M[i * n + j] * v[j]
    result[i] = sum
  }
  return result
}

function dot(a: Float64Array, b: Float64Array, n: number): number {
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

function normalize(v: Float64Array): void {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm
}

function maxAbsDiff(a: Float64Array, b: Float64Array, n: number): number {
  let max = 0
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i])
    if (d > max) max = d
  }
  return max
}
