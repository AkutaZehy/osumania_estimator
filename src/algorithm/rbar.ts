// ============================================================
// rbar.ts — computeRbar (release strain)
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 189-194, 725-759
// ============================================================

import { bisectLeft, smoothOnCorners } from "./mathUtils.js";

type NoteTuple = [number, number, number]; // [column, head, tail]

/**
 * Find the next note in a given column after the specified time.
 *
 * Uses binary search on the column's head-time array.
 * Matches the JS reference findNextNoteInColumn (lines 189-194).
 *
 * @returns [head_time, tail_time] or [0, 1e9, 1e9] as fallback
 */
function findNextNoteInColumn(
  note: NoteTuple,
  times: number[],
  noteSeqByColumn: NoteTuple[][],
): NoteTuple {
  const k = note[0];
  const h = note[1];
  const idx = bisectLeft(times, h);
  if (idx + 1 < noteSeqByColumn[k]!.length) {
    return noteSeqByColumn[k]![idx + 1]!;
  }
  return [0, 1e9, 1e9];
}

/**
 * Compute Rbar — release strain at each base corner.
 *
 * Release Index I for each LN:
 *   I_h = 0.001 · |t − h − 80| / x
 *   I_t = 0.001 · |next_head − t − 80| / x
 *   I = 2 / (2 + exp(−5·(I_h − 0.75)) + exp(−5·(I_t − 0.75)))
 *
 * Between successive LN tail times:
 *   R_step = 0.08 · δ_r^(−0.5) · x^(−1) · (1 + 0.8·(I_i + I_{i+1}))
 *
 * Smooth with 500ms sliding sum.
 *
 * @param K - Column/key count
 * @param x - Hit leniency
 * @param noteSeqByColumn - Notes grouped by column
 * @param tailSeq - LN notes sorted by tail time
 * @param baseCorners - Base corner time positions (sorted)
 * @returns Rbar strain values
 */
export function computeRbar(
  K: number,
  x: number,
  noteSeqByColumn: NoteTuple[][],
  tailSeq: NoteTuple[],
  baseCorners: Float64Array,
): Float64Array {
  const RStep = new Float64Array(baseCorners.length);

  // Build per-column head-time arrays for binary search
  const timesByColumn: number[][] = [];
  for (let i = 0; i < K; i++) {
    timesByColumn.push(
      (noteSeqByColumn[i] ?? []).map((note) => note[1]),
    );
  }

  // Compute Release Index I for each LN tail
  const IList: number[] = [];
  for (let i = 0; i < tailSeq.length; i++) {
    const [k, hI, tI] = tailSeq[i]!;
    const [, hJ] = findNextNoteInColumn(
      [k, hI, tI],
      timesByColumn[k]!,
      noteSeqByColumn,
    );
    const I_h = (0.001 * Math.abs(tI - hI - 80)) / x;
    const I_t = (0.001 * Math.abs(hJ - tI - 80)) / x;
    IList.push(
      2 / (2 + Math.exp(-5 * (I_h - 0.75)) + Math.exp(-5 * (I_t - 0.75))),
    );
  }

  // Assign R values between successive tail times
  for (let i = 0; i < tailSeq.length - 1; i++) {
    const tStart = tailSeq[i]![2];
    const tEnd = tailSeq[i + 1]![2];

    const leftIdx = bisectLeft(baseCorners, tStart);
    const rightIdx = bisectLeft(baseCorners, tEnd);
    if (leftIdx >= rightIdx) continue;

    const deltaR = 0.001 * (tEnd - tStart);
    const rValue =
      0.08 * deltaR ** -0.5 * x ** -1 * (1 + 0.8 * (IList[i]! + IList[i + 1]!));

    for (let idx = leftIdx; idx < rightIdx; idx++) {
      RStep[idx] = rValue;
    }
  }

  return smoothOnCorners(baseCorners, RStep, 500, 0.001, "sum");
}
