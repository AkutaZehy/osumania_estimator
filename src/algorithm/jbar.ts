// ============================================================
// jbar.ts — computeJbar (jack/density/speed strain)
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 498-549
// ============================================================

import { bisectLeft, smoothOnCorners } from "./mathUtils.js";

type NoteTuple = [number, number, number]; // [column, head, tail]

/**
 * Jack nerfer: reduces strain for jacks that are close to 80ms apart.
 * Centers around delta=0.08 (80ms), creating a penalty dip.
 */
function jackNerfer(delta: number): number {
  return 1 - 7e-5 * (0.15 + Math.abs(delta - 0.08)) ** -4;
}

/**
 * Compute Jbar — jack/density/speed strain at each base corner.
 *
 * For each column independently:
 * 1. Between adjacent notes: val = delta⁻¹ · (delta + 0.11·x^(1/4))⁻¹
 * 2. Apply jack_nerfer
 * 3. Smooth per-column with 500ms sliding sum
 * 4. Cross-column aggregate: 5th-power weighted mean by 1/delta
 *
 * @param K - Column/key count
 * @param x - Hit leniency (derived from OD)
 * @param noteSeqByColumn - Notes grouped by column
 * @param baseCorners - Base corner time positions (sorted)
 * @returns deltaKs (per-column delta arrays) and Jbar (aggregated strain)
 */
export function computeJbar(
  K: number,
  x: number,
  noteSeqByColumn: NoteTuple[][],
  baseCorners: Float64Array,
): { deltaKs: Float64Array[]; Jbar: Float64Array } {
  // Per-column raw jack value and delta storage
  const Jks: Float64Array[] = [];
  const deltaKs: Float64Array[] = [];

  for (let k = 0; k < K; k++) {
    Jks.push(new Float64Array(baseCorners.length));
    deltaKs.push(new Float64Array(baseCorners.length).fill(1e9));
  }

  // Compute raw jack values per adjacent pair in same column
  const xPow = x ** 0.25;
  for (let k = 0; k < K; k++) {
    const notes = noteSeqByColumn[k];
    if (!notes) continue;

    for (let i = 0; i < notes.length - 1; i++) {
      const start = notes[i]![1];
      const end = notes[i + 1]![1];

      const leftIdx = bisectLeft(baseCorners, start);
      const rightIdx = bisectLeft(baseCorners, end);
      if (leftIdx >= rightIdx) continue;

      const delta = 0.001 * (end - start);
      const val = delta ** -1 * (delta + 0.11 * xPow) ** -1;
      const jVal = val * jackNerfer(delta);

      for (let idx = leftIdx; idx < rightIdx; idx++) {
        Jks[k]![idx] = jVal;
        deltaKs[k]![idx] = delta;
      }
    }
  }

  // Per-column smooth with 500ms sliding sum
  const JbarKs: Float64Array[] = [];
  for (let k = 0; k < K; k++) {
    JbarKs.push(smoothOnCorners(baseCorners, Jks[k]!, 500, 0.001, "sum"));
  }

  // Cross-column aggregation: 5th-power weighted mean
  const Jbar = new Float64Array(baseCorners.length);
  for (let i = 0; i < baseCorners.length; i++) {
    let num = 0;
    let den = 0;
    for (let k = 0; k < K; k++) {
      const v = JbarKs[k]![i]!;
      const w = 1 / deltaKs[k]![i]!;
      num += Math.max(v, 0) ** 5 * w;
      den += w;
    }
    const raw = num / Math.max(1e-9, den);
    Jbar[i] = raw ** (1 / 5);
  }

  return { deltaKs, Jbar };
}
