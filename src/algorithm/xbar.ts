// ============================================================
// xbar.ts — computeXbar (cross/coordination strain)
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 551-635
// ============================================================

import { bisectLeft, mergeByHead, smoothOnCorners } from "./mathUtils.js";

type NoteTuple = [number, number, number]; // [column, head, tail]

/**
 * Cross coefficient matrix for each key count (1K–10K).
 * crossMatrix[K] gives the coefficients for column-pair boundaries 0..K.
 */
const crossMatrix: number[][] = [
  [-1],
  [0.075, 0.075],
  [0.125, 0.05, 0.125],
  [0.125, 0.125, 0.125, 0.125],
  [0.175, 0.25, 0.05, 0.25, 0.175],
  [0.175, 0.25, 0.175, 0.175, 0.25, 0.175],
  [0.225, 0.35, 0.25, 0.05, 0.25, 0.35, 0.225],
  [0.225, 0.35, 0.25, 0.225, 0.225, 0.25, 0.35, 0.225],
  [0.275, 0.45, 0.35, 0.25, 0.05, 0.25, 0.35, 0.45, 0.275],
  [0.275, 0.45, 0.35, 0.25, 0.275, 0.275, 0.25, 0.35, 0.45, 0.275],
  [0.325, 0.55, 0.45, 0.35, 0.25, 0.05, 0.25, 0.35, 0.45, 0.55, 0.325],
];

/**
 * Compute Xbar — cross/coordination strain at each base corner.
 *
 * For each column-pair boundary k (0 to K):
 * 1. Merge note sequences of adjacent columns
 * 2. Between adjacent notes in the merged sequence:
 *    val = 0.16 · max(x, delta)⁻²
 *    fast_cross = max(0, 0.4 · max(delta, 0.06, 0.75·x)⁻² − 80)
 * 3. Cross-column penalty: if neither column is active, val *= (1 − crossCoeff[k])
 * 4. X_base = Σ weighted vals + Σ√(fast_cross terms)
 * 5. Smooth with 500ms sliding sum
 *
 * @param K - Column/key count
 * @param x - Hit leniency
 * @param noteSeqByColumn - Notes grouped by column
 * @param activeColumns - Per-corner list of active column indices
 * @param baseCorners - Base corner time positions (sorted)
 * @returns Xbar strain values
 */
export function computeXbar(
  K: number,
  x: number,
  noteSeqByColumn: NoteTuple[][],
  activeColumns: number[][],
  baseCorners: Float64Array,
): Float64Array {
  if (K < 1 || K > 10) {
    return new Float64Array(baseCorners.length);
  }

  const crossCoeff = crossMatrix[K]!;

  // Per-boundary raw values and fast-cross values
  const Xks: Float64Array[] = [];
  const fastCross: Float64Array[] = [];

  for (let k = 0; k <= K; k++) {
    Xks.push(new Float64Array(baseCorners.length));
    fastCross.push(new Float64Array(baseCorners.length));
  }

  for (let k = 0; k <= K; k++) {
    let notesInPair: NoteTuple[];

    if (k === 0) {
      notesInPair = noteSeqByColumn[0] ?? [];
    } else if (k === K) {
      notesInPair = noteSeqByColumn[K - 1] ?? [];
    } else {
      notesInPair = mergeByHead(
        noteSeqByColumn[k - 1] ?? [],
        noteSeqByColumn[k] ?? [],
      );
    }

    for (let i = 1; i < notesInPair.length; i++) {
      const start = notesInPair[i - 1]![1];
      const end = notesInPair[i]![1];

      const idxStart = bisectLeft(baseCorners, start);
      const idxEnd = bisectLeft(baseCorners, end);
      if (idxStart >= idxEnd) continue;

      const delta = 0.001 * (end - start);
      let val = 0.16 * Math.max(x, delta) ** -2;

      const leftActive = activeColumns[Math.min(idxStart, activeColumns.length - 1)] ?? [];
      const rightActive = activeColumns[Math.min(idxEnd, activeColumns.length - 1)] ?? [];

      if (
        (!leftActive.includes(k - 1) && !rightActive.includes(k - 1)) ||
        (!leftActive.includes(k) && !rightActive.includes(k))
      ) {
        val *= 1 - crossCoeff[k]!;
      }

      const fast = Math.max(
        0,
        0.4 * Math.max(delta, 0.06, 0.75 * x) ** -2 - 80,
      );

      for (let idx = idxStart; idx < idxEnd; idx++) {
        Xks[k]![idx] = val;
        fastCross[k]![idx] = fast;
      }
    }
  }

  // Aggregate into xBase
  const xBase = new Float64Array(baseCorners.length);
  for (let i = 0; i < baseCorners.length; i++) {
    let sum1 = 0;
    for (let k = 0; k <= K; k++) {
      sum1 += Xks[k]![i]! * crossCoeff[k]!;
    }

    let sum2 = 0;
    for (let k = 0; k < K; k++) {
      sum2 += Math.sqrt(
        fastCross[k]![i]! *
          crossCoeff[k]! *
          fastCross[k + 1]![i]! *
          crossCoeff[k + 1]!,
      );
    }

    xBase[i] = sum1 + sum2;
  }

  return smoothOnCorners(baseCorners, xBase, 500, 0.001, "sum");
}
