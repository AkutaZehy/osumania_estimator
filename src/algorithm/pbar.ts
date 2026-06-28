// ============================================================
// pbar.ts — computePbar (pattern/physical stream strain)
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 481-496, 637-684
// ============================================================

import { bisectLeft, bisectRight, smoothOnCorners } from "./mathUtils.js";
import type { LNBodiesSparseRep } from "./corners.js";

type NoteTuple = [number, number, number]; // [column, head, tail]

/**
 * Query the cumulative LN body density between two times.
 *
 * Matches the JS reference lnSum function exactly (lines 481-496).
 *
 * @param a - Start time (ms)
 * @param b - End time (ms)
 * @param lnRep - Sparse cumulative LN body representation
 * @returns Cumulative LN body density between a and b
 */
export function lnSum(
  a: number,
  b: number,
  lnRep: LNBodiesSparseRep,
): number {
  const { points, cumsum, values } = lnRep;

  const i = bisectRight(points, a) - 1;
  const j = bisectRight(points, b) - 1;

  if (i === j) {
    return (b - a) * values[i]!;
  }

  let total = 0;
  total += (points[i + 1]! - a) * values[i]!;
  total += cumsum[j]! - cumsum[i + 1]!;
  total += (b - points[j]!) * values[j]!;
  return total;
}

/**
 * Stream booster: amplifies strain for dense streams (160 < 7.5/δ < 360).
 */
function streamBooster(delta: number): number {
  const expr = 7.5 / delta;
  if (160 < expr && expr < 360) {
    return 1 + 1.7e-7 * (expr - 160) * (expr - 360) ** 2;
  }
  return 1;
}

/**
 * Compute Pbar — pattern/physical stream strain at each base corner.
 *
 * For each adjacent note pair in the flat note sequence:
 * 1. Simultaneous notes (δ ≈ 0): spike per extra simultaneous note
 * 2. Regular notes: strain depends on whether δ < 2x/3 (two regimes)
 * 3. LN body influence: v = 1 + 6·0.001·lnSum
 * 4. Stream booster amplifies certain density ranges
 * 5. Anchor cap: min(inc·anchor, max(inc, inc·2−10))
 * 6. Smooth with 500ms sliding sum
 *
 * @param x - Hit leniency
 * @param noteSeq - Flat note sequence sorted by head time
 * @param lnRep - Sparse LN body cumulative representation
 * @param anchor - Anchor multiplier per corner
 * @param baseCorners - Base corner time positions (sorted)
 * @returns Pbar strain values
 */
export function computePbar(
  x: number,
  noteSeq: NoteTuple[],
  lnRep: LNBodiesSparseRep,
  anchor: Float64Array,
  baseCorners: Float64Array,
): Float64Array {
  const pStep = new Float64Array(baseCorners.length);

  for (let i = 0; i < noteSeq.length - 1; i++) {
    const hL = noteSeq[i]![1];
    const hR = noteSeq[i + 1]![1];
    const deltaTime = hR - hL;

    // Simultaneous notes (Dirac delta case)
    if (deltaTime < 1e-9) {
      const spike = 1000 * (0.02 * (4 / x - 24)) ** 0.25;
      const leftIdx = bisectLeft(baseCorners, hL);
      const rightIdx = bisectRight(baseCorners, hL);
      for (let idx = leftIdx; idx < rightIdx; idx++) {
        pStep[idx]! += spike;
      }
      continue;
    }

    const leftIdx = bisectLeft(baseCorners, hL);
    const rightIdx = bisectLeft(baseCorners, hR);
    if (leftIdx >= rightIdx) continue;

    const delta = 0.001 * deltaTime;
    const v = 1 + 6 * 0.001 * lnSum(hL, hR, lnRep);
    const bVal = streamBooster(delta);

    let inc: number;
    if (delta < (2 * x) / 3) {
      inc =
        delta ** -1 *
        (0.08 * x ** -1 * (1 - 24 * x ** -1 * (delta - x / 2) ** 2)) **
          0.25 *
        Math.max(bVal, v);
    } else {
      inc =
        delta ** -1 *
        (0.08 * x ** -1 * (1 - 24 * x ** -1 * (x / 6) ** 2)) ** 0.25 *
        Math.max(bVal, v);
    }

    for (let idx = leftIdx; idx < rightIdx; idx++) {
      pStep[idx]! += Math.min(
        inc * anchor[idx]!,
        Math.max(inc, inc * 2 - 10),
      );
    }
  }

  return smoothOnCorners(baseCorners, pStep, 500, 0.001, "sum");
}
