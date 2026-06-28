// ============================================================
// abar.ts — computeAbar (alternation ease)
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 686-723
// ============================================================

import { bisectLeft, smoothOnCorners } from "./mathUtils.js";

/**
 * Compute Abar — alternation/release ease at each A corner.
 *
 * Abar starts at 1.0 and is multiplied by penalty factors (<1)
 * for adjacent active columns with similar timing patterns.
 *
 * 1. Compute dks: for each adjacent column pair, measure delta similarity
 *    dks[k][i] = |delta_ks[k][i] − delta_ks[k+1][i]| + 0.4·max(0, max_delta − 0.11)
 * 2. For each A corner, look up the active columns at the nearest base corner
 * 3. Apply penalties based on d_val thresholds:
 *    - d_val < 0.02 → multiply by min(0.75 + 0.5·max_delta, 1)
 *    - d_val < 0.07 → multiply by min(0.65 + 5·d_val + 0.5·max_delta, 1)
 * 4. Smooth with 250ms sliding average
 *
 * @param K - Column/key count
 * @param activeColumns - Per-corner list of active column indices
 * @param deltaKs - Per-column delta arrays from computeJbar
 * @param ACorners - A (coarse) corner time positions (sorted)
 * @param baseCorners - Base corner time positions (sorted)
 * @returns Abar values (≤1, lower = harder to alternate)
 */
export function computeAbar(
  K: number,
  activeColumns: number[][],
  deltaKs: Float64Array[],
  ACorners: Float64Array,
  baseCorners: Float64Array,
): Float64Array {
  // dks[k]: "alternation delta" for column pair (k, k+1)
  const dks: Float64Array[] = [];
  for (let k = 0; k < K - 1; k++) {
    dks.push(new Float64Array(baseCorners.length));
  }

  for (let i = 0; i < baseCorners.length; i++) {
    const cols = activeColumns[i] ?? [];
    for (let j = 0; j < cols.length - 1; j++) {
      const k0 = cols[j]!;
      const k1 = cols[j + 1]!;
      dks[k0]![i] =
        Math.abs(deltaKs[k0]![i]! - deltaKs[k1]![i]!) +
        0.4 * Math.max(0, Math.max(deltaKs[k0]![i]!, deltaKs[k1]![i]!) - 0.11);
    }
  }

  // Apply penalties at A corners
  const aStep = new Float64Array(ACorners.length).fill(1);

  for (let i = 0; i < ACorners.length; i++) {
    const s = ACorners[i]!;
    let idx = bisectLeft(baseCorners, s);
    if (idx >= baseCorners.length) idx = baseCorners.length - 1;

    const cols = activeColumns[idx] ?? [];
    for (let j = 0; j < cols.length - 1; j++) {
      const k0 = cols[j]!;
      const k1 = cols[j + 1]!;
      const dVal = dks[k0]![idx]!;

      if (dVal < 0.02) {
        aStep[i] = aStep[i]! * Math.min(
          0.75 + 0.5 * Math.max(deltaKs[k0]![idx]!, deltaKs[k1]![idx]!),
          1,
        );
      } else if (dVal < 0.07) {
        aStep[i] = aStep[i]! * Math.min(
          0.65 +
            5 * dVal +
            0.5 * Math.max(deltaKs[k0]![idx]!, deltaKs[k1]![idx]!),
          1,
        );
      }
    }
  }

  return smoothOnCorners(ACorners, aStep, 250, 1, "avg");
}
