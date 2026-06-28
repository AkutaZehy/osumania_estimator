// ============================================================
// density.ts — computeCAndKs (local note density + active columns)
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 761-792
// ============================================================

type NoteTuple = [number, number, number]; // [column, head, tail]

/**
 * Compute C (local note count within ±500ms) and Ks (active column count)
 * at each base corner position.
 *
 * @param K - Column/key count
 * @param noteSeq - Flat note sequence sorted by head time
 * @param keyUsage - Per-column boolean usage arrays at baseCorners
 * @param baseCorners - Base corner time positions (sorted)
 * @returns CStep (note counts) and KsStep (active column counts, minimum 1)
 */
export function computeCAndKs(
  K: number,
  noteSeq: NoteTuple[],
  keyUsage: boolean[][],
  baseCorners: Float64Array,
): { CStep: Float64Array; KsStep: Float64Array } {
  // ---- C(s): count of notes within ±500 ms ----
  const noteHitTimes = noteSeq.map((n) => n[1]).sort((a, b) => a - b);

  const CStep = new Float64Array(baseCorners.length);
  let lo = 0;
  let hi = 0;

  for (let i = 0; i < baseCorners.length; i++) {
    const s = baseCorners[i]!;
    const low = s - 500;
    const high = s + 500;

    while (lo < noteHitTimes.length && noteHitTimes[lo]! < low) {
      lo += 1;
    }
    while (hi < noteHitTimes.length && noteHitTimes[hi]! < high) {
      hi += 1;
    }

    CStep[i] = hi - lo;
  }

  // ---- Ks(s): number of active columns (minimum 1) ----
  const KsStep = new Float64Array(baseCorners.length);
  for (let i = 0; i < baseCorners.length; i++) {
    let count = 0;
    for (let k = 0; k < K; k++) {
      if (keyUsage[k]![i]) count += 1;
    }
    KsStep[i] = Math.max(count, 1);
  }

  return { CStep, KsStep };
}
