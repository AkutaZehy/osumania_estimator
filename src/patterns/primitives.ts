// ============================================================
// Pattern Primitives — row-level feature extraction
// Ported from osumania_map_analyser js/patterns/primitives.js
// ============================================================

import { NoteType, type Chart } from "../types/chart.js";
import { Direction, type PrimitiveRow } from "../types/primitives.js";
import { PATTERNS_CONFIG } from "./config.js";

/**
 * Number of columns on the left hand.
 * Hardcoded for common keymodes; falls back to floor(keys/2).
 */
function keysOnLeftHand(keymode: number): number {
  if (keymode === 3) return 2;
  if (keymode === 4) return 2;
  if (keymode === 5) return 3;
  if (keymode === 6) return 3;
  if (keymode === 7) return 4;
  if (keymode === 8) return 4;
  if (keymode === 9) return 5;
  if (keymode === 10) return 5;
  return Math.max(1, Math.floor(keymode / 2));
}

/**
 * Effective beat length (ms per beat) at a given time.
 * Scans BPM timeline and returns the active beat length.
 */
function beatLengthAt(chart: Chart, time: number): number {
  if (!chart.bpm.length) return 500;
  const first = chart.bpm[0]!;
  let current = first.beatLength;
  for (const item of chart.bpm) {
    if (item.time > time) break;
    current = item.beatLength;
  }
  return current;
}

/**
 * Detect column movement direction between two consecutive rows.
 *
 * Direction logic:
 *   leftmostChange>0  && rightmostChange>0  → RIGHT
 *   leftmostChange>0  && rightmostChange≤0  → INWARDS
 *   leftmostChange<0  && rightmostChange<0  → LEFT
 *   leftmostChange<0  && rightmostChange≥0  → OUTWARDS
 *   leftmostChange===0 && rightmostChange<0 → INWARDS
 *   leftmostChange===0 && rightmostChange>0 → OUTWARDS
 *   else → NONE
 */
export function detectDirection(
  prevLeftmost: number,
  prevRightmost: number,
  currLeftmost: number,
  currRightmost: number,
): Direction {
  const leftmostChange = currLeftmost - prevLeftmost;
  const rightmostChange = currRightmost - prevRightmost;

  if (leftmostChange > 0) {
    return rightmostChange > 0 ? Direction.RIGHT : Direction.INWARDS;
  }
  if (leftmostChange < 0) {
    return rightmostChange < 0 ? Direction.LEFT : Direction.OUTWARDS;
  }
  if (rightmostChange < 0) {
    return Direction.INWARDS;
  }
  if (rightmostChange > 0) {
    return Direction.OUTWARDS;
  }
  return Direction.NONE;
}

/**
 * Extract row-level primitives from a Chart.
 * Each returned PrimitiveRow corresponds to one TimeItem.
 */
export function calculatePrimitives(chart: Chart): PrimitiveRow[] {
  if (!chart.notes.length) return [];
  const firstNote = chart.notes[0]!.time;
  const firstRow = chart.notes[0]!.data;

  // Build previousRow: columns with playable notes (NORMAL or HOLDHEAD)
  let previousRow: number[] = [];
  for (let k = 0; k < chart.keys; k += 1) {
    if (firstRow[k] === NoteType.NORMAL || firstRow[k] === NoteType.HOLDHEAD) {
      previousRow.push(k);
    }
  }

  if (!previousRow.length) return [];

  let previousTime = firstNote;
  let index = 0;
  const leftHandKeys = keysOnLeftHand(chart.keys);
  const out: PrimitiveRow[] = [];

  for (const item of chart.notes.slice(1)) {
    const t = item.time;
    const row = item.data;
    index += 1;

    const currentRow: number[] = [];
    const normalNotes: number[] = [];
    const lnHeads: number[] = [];
    const lnBodies: number[] = [];
    const lnTails: number[] = [];

    for (let k = 0; k < chart.keys; k += 1) {
      const n = row[k];
      if (n === NoteType.NORMAL || n === NoteType.HOLDHEAD) currentRow.push(k);
      if (n === NoteType.NORMAL) normalNotes.push(k);
      if (n === NoteType.HOLDHEAD) lnHeads.push(k);
      else if (n === NoteType.HOLDBODY) lnBodies.push(k);
      else if (n === NoteType.HOLDTAIL) lnTails.push(k);
    }

    // Skip fully empty rows (no notes, no LN bodies/tails)
    if (!currentRow.length && !lnHeads.length && !lnBodies.length && !lnTails.length) {
      continue;
    }

    let direction: Direction = Direction.NONE;
    let isRoll = false;
    let jacks = 0;

    if (currentRow.length) {
      const prevLeftmost = previousRow[0]!;
      const prevRightmost = previousRow[previousRow.length - 1]!;
      const currLeftmost = currentRow[0]!;
      const currRightmost = currentRow[currentRow.length - 1]!;

      direction = detectDirection(prevLeftmost, prevRightmost, currLeftmost, currRightmost);
      isRoll = prevLeftmost > currRightmost || prevRightmost < currLeftmost;

      const prevSet = new Set(previousRow);
      jacks = currentRow.filter((x) => prevSet.has(x)).length;
    }

    out.push({
      index,
      time: t - firstNote,
      msPerBeat: (t - previousTime) * 4.0,
      beatLength: beatLengthAt(chart, t),
      notes: currentRow.length,
      jacks,
      direction,
      roll: isRoll,
      keys: chart.keys,
      leftHandKeys,
      lnHeads,
      lnBodies,
      lnTails,
      normalNotes,
      rawNotes: currentRow,
    });

    if (currentRow.length) previousRow = currentRow;
    previousTime = t;
  }

  return out;
}

/**
 * Fraction of notes that are LN heads (vs total playable notes).
 */
export function lnPercent(chart: Chart): number {
  let notes = 0;
  let lnotes = 0;

  for (const item of chart.notes) {
    for (const n of item.data) {
      if (n === NoteType.NORMAL) notes += 1;
      else if (n === NoteType.HOLDHEAD) {
        notes += 1;
        lnotes += 1;
      }
    }
  }

  return notes > 0 ? lnotes / notes : 0;
}

/**
 * Total time (ms) spent in non-1.0× scroll velocity sections.
 * Returns 0 if ≤1 distinct non-1.0 interval, or the capped extreme-SV
 * time if BPM is extreme.
 */
export function svTime(chart: Chart): number {
  if (!chart.sv.length) return 0;

  let total = 0;
  let time = chart.firstNote;
  let vel = 1;
  let nonOneIntervals = 0;
  let inNonOne = false;

  for (const sv of chart.sv) {
    const curVel = sv.multiplier;
    const curNonOne =
      !Number.isFinite(curVel) ||
      Math.abs(curVel - 1) > PATTERNS_CONFIG.SV_SPEED_EPS;

    if (
      !Number.isFinite(vel) ||
      Math.abs(vel - 1) > PATTERNS_CONFIG.SV_SPEED_EPS
    ) {
      total += sv.time - time;
    }

    if (curNonOne && !inNonOne) {
      nonOneIntervals += 1;
      inNonOne = true;
    } else if (!curNonOne) {
      inNonOne = false;
    }

    vel = curVel;
    time = sv.time;
  }

  if (
    !Number.isFinite(vel) ||
    Math.abs(vel - 1) > PATTERNS_CONFIG.SV_SPEED_EPS
  ) {
    total += chart.lastNote - time;
  }

  if (nonOneIntervals <= 1) {
    return 0;
  }

  let extreme = false;
  const bpms = chart.bpm;
  if (bpms.length >= 1) {
    let prevMsPerBeat: number | null = null;
    for (const item of bpms) {
      const msPerBeat = item.beatLength;
      if (!Number.isFinite(msPerBeat) || msPerBeat <= 0) {
        extreme = true;
        break;
      }

      const bpm = 60000.0 / msPerBeat;
      if (
        bpm <= PATTERNS_CONFIG.SV_EXTREME_BPM_MIN ||
        bpm >= PATTERNS_CONFIG.SV_EXTREME_BPM_MAX
      ) {
        extreme = true;
        break;
      }

      if (Number.isFinite(prevMsPerBeat) && prevMsPerBeat !== null && prevMsPerBeat > 0) {
        const ratio = Math.max(
          prevMsPerBeat / msPerBeat,
          msPerBeat / prevMsPerBeat,
        );
        if (ratio >= PATTERNS_CONFIG.SV_EXTREME_BPM_RATIO) {
          extreme = true;
          break;
        }
      }

      prevMsPerBeat = msPerBeat;
    }
  }

  if (extreme) {
    return Math.max(total, PATTERNS_CONFIG.SV_AMOUNT_THRESHOLD + 1.0);
  }

  return total;
}
