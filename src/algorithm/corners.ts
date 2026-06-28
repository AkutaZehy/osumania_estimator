// ============================================================
// Corner System — sample points & per-column key usage
// Ported from osumania_map_analyser sunnyAlgorithm.js
// lines 327-478 (getCorners, getKeyUsage, getKeyUsage400,
//                computeAnchor, lnBodiesCountSparseRepresentation)
// ============================================================

import { bisectLeft } from "./mathUtils.js";

// Re-exported so consumers don't need a separate import
import { bisectRight } from "./mathUtils.js";
void bisectRight; // suppress unused-import warning — available for consumers

// ------------------------------------------------------------
// Shared note-tuple type
// ------------------------------------------------------------

type NoteTuple = [number, number, number]; // [column, head, tail]

// ------------------------------------------------------------
// getCorners — build corner point arrays at three resolutions
// ------------------------------------------------------------

/**
 * Build corner time arrays used as sample points throughout the algorithm.
 *
 * Three resolutions:
 * - **base**: note heads, LN tails, ±501 ms, ±499 ms, +1 ms offsets, plus 0 and T
 * - **A** (coarse): note heads, LN tails, ±1000 ms offsets, plus 0 and T
 * - **all**: deduplicated union of base + A
 *
 * @returns Float64Arrays sorted ascending, clipped to [0, T]
 */
export function getCorners(
  noteSeq: NoteTuple[],
  _lnSeq: NoteTuple[],
  T: number,
): { base: Float64Array; A: Float64Array; all: Float64Array } {
  // ---- base corners ----
  const cornersBase = new Set<number>();
  for (const [, h, t] of noteSeq) {
    cornersBase.add(h);
    if (t >= 0) cornersBase.add(t);
  }

  const copyBase = [...cornersBase];
  for (const s of copyBase) {
    cornersBase.add(s + 501);
    cornersBase.add(s - 499);
    cornersBase.add(s + 1);
  }
  cornersBase.add(0);
  cornersBase.add(T);

  const baseArr = [...cornersBase]
    .filter((s) => s >= 0 && s <= T)
    .sort((a, b) => a - b);
  const base = new Float64Array(baseArr);

  // ---- A (coarse) corners ----
  const cornersA = new Set<number>();
  for (const [, h, t] of noteSeq) {
    cornersA.add(h);
    if (t >= 0) cornersA.add(t);
  }

  const copyA = [...cornersA];
  for (const s of copyA) {
    cornersA.add(s + 1000);
    cornersA.add(s - 1000);
  }
  cornersA.add(0);
  cornersA.add(T);

  const aArr = [...cornersA]
    .filter((s) => s >= 0 && s <= T)
    .sort((a, b) => a - b);
  const A = new Float64Array(aArr);

  // ---- all corners (union) ----
  const allSet = new Set([...baseArr, ...aArr]);
  const allArr = [...allSet].sort((a, b) => a - b);
  const all = new Float64Array(allArr);

  return { base, A, all };
}

// ------------------------------------------------------------
// getKeyUsage — boolean per-column corner coverage
// ------------------------------------------------------------

/**
 * Compute per-column boolean key usage at each base corner.
 *
 * A corner is "used" by a column if any note in that column
 * covers the corner within a ±150 ms window:
 *   - singles: [h - 150, h + 150)
 *   - LNs:     [h - 150, min(t + 150, T - 1))
 *
 * @returns keyUsage[k][cornerIdx] — true when column k is active
 */
export function getKeyUsage(
  noteSeqByColumn: NoteTuple[][],
  baseCorners: Float64Array,
  K: number,
  T: number,
): boolean[][] {
  const keyUsage: boolean[][] = [];
  for (let k = 0; k < K; k++) {
    keyUsage.push(new Array<boolean>(baseCorners.length).fill(false));
  }

  // Iterate column-by-column (equivalent to flat noteSeq loop in JS ref)
  for (let k = 0; k < K; k++) {
    const colNotes = noteSeqByColumn[k];
    if (!colNotes) continue;

    for (const [, h, t] of colNotes) {
      const startTime = Math.max(h - 150, 0);
      const endTime = t < 0 ? h + 150 : Math.min(t + 150, T - 1);

      const leftIdx = bisectLeft(baseCorners, startTime);
      const rightIdx = bisectLeft(baseCorners, endTime);

      for (let idx = leftIdx; idx < rightIdx; idx++) {
        keyUsage[k]![idx] = true;
      }
    }
  }

  return keyUsage;
}

// ------------------------------------------------------------
// getKeyUsage_400 — weighted per-column corner usage with decay
// ------------------------------------------------------------

/**
 * Compute per-column weighted key usage (Float64) at each base corner.
 *
 * Three regions per note:
 * - **Body** [h, t):     3.75 + min(duration, 1500) / 150
 * - **Before** (-400, h): quadratic decay from 3.75 → 0
 * - **After** (t, +400):  quadratic decay from 3.75 → 0
 *
 * @returns keyUsage400[k] — Float64Array of accumulated weights
 */
export function getKeyUsage_400(
  noteSeqByColumn: NoteTuple[][],
  baseCorners: Float64Array,
  T: number,
): Float64Array[] {
  const K = noteSeqByColumn.length;
  const keyUsage400: Float64Array[] = [];
  for (let k = 0; k < K; k++) {
    keyUsage400.push(new Float64Array(baseCorners.length));
  }

  const decayFactor = 3.75 / (400 * 400); // pre-compute constant

  for (let k = 0; k < K; k++) {
    const colNotes = noteSeqByColumn[k];
    if (!colNotes) continue;

    for (const [, h, t] of colNotes) {
      const startTime = Math.max(h, 0);
      const endTime = t < 0 ? h : Math.min(t, T - 1);
      const duration = endTime - startTime;

      const left400Idx = bisectLeft(baseCorners, startTime - 400);
      const leftIdx = bisectLeft(baseCorners, startTime);
      const rightIdx = bisectLeft(baseCorners, endTime);
      const right400Idx = bisectLeft(baseCorners, endTime + 400);

      // Body contribution
      const bodyValue = 3.75 + Math.min(duration, 1500) / 150;
      const colArr = keyUsage400[k]!;
      for (let idx = leftIdx; idx < rightIdx; idx++) {
        colArr[idx] = colArr[idx]! + bodyValue;
      }

      // Before: quadratic decay from startTime back to startTime - 400
      for (let idx = left400Idx; idx < leftIdx; idx++) {
        const dist = baseCorners[idx]! - startTime; // negative
        colArr[idx] = colArr[idx]! + (3.75 - decayFactor * (dist * dist));
      }

      // After: quadratic decay from endTime forward to endTime + 400
      for (let idx = rightIdx; idx < right400Idx; idx++) {
        const dist = Math.abs(baseCorners[idx]! - endTime);
        colArr[idx] = colArr[idx]! + (3.75 - decayFactor * (dist * dist));
      }
    }
  }

  return keyUsage400;
}

// ------------------------------------------------------------
// computeAnchor — anchor bonus from inter-column weighting
// ------------------------------------------------------------

/**
 * Compute anchor multiplier per corner from weighted key usage.
 *
 * At each corner, sorts column usage counts descending, then:
 *   walk  = Σ c[i] · (1 - 4 · (0.5 - c[i+1]/c[i])²)
 *   ratio = walk / maxWalk
 *   anchor = 1 + min(ratio - 0.18, 5 · (ratio - 0.22)³)
 *
 * @returns Float64Array of anchor values (≥1)
 */
export function computeAnchor(
  keyUsage400s: Float64Array[],
  K: number,
): Float64Array {
  const n = keyUsage400s[0]?.length ?? 0;
  const anchor = new Float64Array(n);

  if (K === 0 || n === 0) return anchor;

  for (let idx = 0; idx < n; idx++) {
    // Collect and sort descending
    const counts = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      counts[k] = keyUsage400s[k]![idx]!;
    }
    counts.sort((a, b) => b - a);

    // Count non-zero entries (sorted descending → zeros are at the end)
    let nonZeroLen = 0;
    for (let i = 0; i < K; i++) {
      if (counts[i]! !== 0) nonZeroLen++;
      else break;
    }

    if (nonZeroLen > 1) {
      let walk = 0;
      let maxWalk = 0;
      for (let i = 0; i < nonZeroLen - 1; i++) {
        const ratio = counts[i + 1]! / counts[i]!;
        walk += counts[i]! * (1 - 4 * ((0.5 - ratio) ** 2));
        maxWalk += counts[i]!;
      }
      anchor[idx] = walk / maxWalk;
    } else {
      anchor[idx] = 0;
    }
  }

  // Post-process: apply anchor formula
  for (let i = 0; i < n; i++) {
    const raw = anchor[i]!;
    anchor[i] = 1 + Math.min(raw - 0.18, 5 * ((raw - 0.22) ** 3));
  }

  return anchor;
}

// ------------------------------------------------------------
// LN_bodies_count_sparse_representation
// ------------------------------------------------------------

/** Sparse cumulative representation of LN body density over time */
export interface LNBodiesSparseRep {
  /** Time points where density changes */
  points: number[];
  /** Cumulative integral at each point */
  cumsum: number[];
  /** Density values per segment */
  values: number[];
}

/**
 * Build a sparse cumulative representation of LN body density.
 *
 * For each LN, three events fire:
 *   t0 = min(h+60, t):  +1.3
 *   t1 = min(h+120, t): -0.3  (i.e. -1.3 + 1)
 *   t  = tail:          -1.0
 *
 * Density is clamped: v = min(curr, 2.5 + 0.5·curr)
 *
 * @param lnSeqByColumn - LN notes grouped by column (flattened internally)
 * @param baseCorners - used only to infer T (last corner)
 */
export function LN_bodies_count_sparse_representation(
  lnSeqByColumn: NoteTuple[][],
  baseCorners: Float64Array,
): LNBodiesSparseRep {
  // Flatten — algorithm operates on all LNs regardless of column
  const allLNs: NoteTuple[] = [];
  for (const colNotes of lnSeqByColumn) {
    for (const n of colNotes) {
      allLNs.push(n);
    }
  }

  const T = baseCorners[baseCorners.length - 1] ?? 0;
  const diff = new Map<number, number>();

  for (const [, h, t] of allLNs) {
    const t0 = Math.min(h + 60, t);
    const t1 = Math.min(h + 120, t);

    diff.set(t0, (diff.get(t0) ?? 0) + 1.3);
    diff.set(t1, (diff.get(t1) ?? 0) + (-1.3 + 1)); // = -0.3
    diff.set(t, (diff.get(t) ?? 0) - 1);
  }

  // Collect all boundary points
  const pointsSet = new Set<number>([0, T]);
  for (const k of diff.keys()) pointsSet.add(k);
  const points = [...pointsSet].sort((a, b) => a - b);

  // Build cumulative representation
  const values: number[] = [];
  const cumsum: number[] = [0];
  let curr = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const t = points[i]!;
    if (diff.has(t)) curr += diff.get(t)!;

    const v = Math.min(curr, 2.5 + 0.5 * curr);
    values.push(v);

    const segLength = points[i + 1]! - points[i]!;
    cumsum.push(cumsum[cumsum.length - 1]! + segLength * v);
  }

  return { points, cumsum, values };
}
