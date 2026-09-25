// ============================================================
// Grid Analysis — per-cell detection primitives
// (subdivision, single-cell jack, cross-cell jack, beat structure)
// ============================================================

import type { ParsedBeatmap } from "../../types/beatmap.js";
import type { CellResult, NoteInfo } from "./types.js";
import { getActiveBeatLength } from "./timing.js";

interface SubdivisionCandidate {
  denom: number;
  interval: number;
  count: number;  // consecutive match count
}

/**
 * Detect the finest subdivision based on minimum non-zero interval.
 * Accepts a candidate if at least one interval matches its target (±20%).
 * For denser cells (≥3 non-zero intervals), requires 2+ consecutive matches.
 * Gracefully handles chords by skipping 0-delay intervals.
 * Returns null if no subdivision detected → treat as grace.
 */
export function detectSubdivision(
  notes: NoteInfo[],
  beatLength: number,
): SubdivisionCandidate | null {
  if (notes.length < 2) return null;

  // Possible subdivisions and their target intervals
  const candidates: number[] = [2, 3, 4, 6, 8, 12];
  const tolerance = 0.20; // 20% jitter tolerance

  // Compute all non-zero intervals between consecutive notes
  const intervals: number[] = [];
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i]!.start - sorted[i - 1]!.start;
    if (dt > 0) intervals.push(dt); // skip 0-delay (chords)
  }

  if (intervals.length === 0) return null;

  let best: SubdivisionCandidate | null = null;

  for (const denom of candidates) {
    const target = beatLength / denom;

    // Count intervals matching target at 1×
    let matchCount1x = 0;
    for (const dt of intervals) {
      if (Math.abs(dt - target) < target * tolerance) {
        matchCount1x++;
      }
    }

    // Require at least one 1× interval match
    if (matchCount1x === 0) continue;

    // For cells with 2+ non-zero intervals, check consecutive run quality.
    // Finer subdivisions require more consecutive matches to avoid
    // misclassifying irregular grace patterns (e.g., pairs of 50ms notes
    // with gaps between them) as 32nd/48th note streams.
    let maxConsecutive = 0;
    let currentRun = 0;
    for (const dt of intervals) {
      if (Math.abs(dt - target) < target * tolerance) {
        currentRun++;
        if (currentRun > maxConsecutive) maxConsecutive = currentRun;
      } else {
        currentRun = 0;
      }
    }

    // Consecutive match requirements per subdivision
    const minConsecutive = denom <= 4 ? 2 : denom <= 8 ? 3 : 4;

    // Accept: must have at least 1 matching interval;
    // if 2+ intervals exist, require enough consecutive matches
    if (intervals.length < 2 || maxConsecutive >= minConsecutive) {
      // Prefer finer subdivisions (higher denom) as they represent faster play
      if (!best || denom > best.denom) {
        best = { denom, interval: target, count: maxConsecutive };
      }
    }
  }

  return best;
}

/**
 * Minimum ratio of jack pairs to total adjacent note pairs required
 * for a cell to be classified as "jack". Used only in cross-cell detection.
 */
const JACK_RATIO_THRESHOLD = 0.33;

/**
 * Strict minijack detection within a single cell.
 *
 * Checks for same-column note pairs at 1-2× sub-beat intervals where
 * there are NO notes of other columns between them (interruption check).
 * This catches true minijacks (e.g., col1, col1, col2, col3) while
 * rejecting stream/jumpstream patterns where other columns intervene.
 *
 * Chordjacks where each column appears once per cell are NOT caught here;
 * they are handled by detectCrossCellJacks below. This is intentional:
 * at 8th-note chordjack (denom=2, the common case), each column only
 * appears once per cell, so detectJack has nothing to check.
 */
export function detectJack(
  notes: NoteInfo[],
  beatLength: number,
  subdivision: number,
): boolean {
  const rice = notes.filter((n) => !n.isLN);
  if (rice.length < 2) return false;

  // For interruption checking: all notes sorted by time
  const timeSorted = [...rice].sort((a, b) => a.start - b.start);

  const subInterval = beatLength / subdivision;
  const tolerance = subInterval * 0.25;

  // Group by column to find same-column pairs
  const colNotes = new Map<number, NoteInfo[]>();
  for (const n of rice) {
    const arr = colNotes.get(n.col) ?? [];
    arr.push(n);
    colNotes.set(n.col, arr);
  }

  // Check each column for consecutive same-column notes at sub-beat intervals
  // with NO interrupting notes of other columns between them
  for (const [, colNts] of colNotes) {
    if (colNts.length < 2) continue;
    const sortedCol = colNts.sort((a, b) => a.start - b.start);
    for (let i = 0; i < sortedCol.length - 1; i++) {
      const dt = sortedCol[i + 1]!.start - sortedCol[i]!.start;
      if (Math.abs(dt - subInterval) < tolerance ||
          Math.abs(dt - subInterval * 2) < tolerance) {

        // Interruption check: are there notes of other columns between?
        const t1 = sortedCol[i]!.start;
        const t2 = sortedCol[i + 1]!.start;
        let hasInterruption = false;
        for (const n of timeSorted) {
          if (n.start > t1 && n.start < t2 && n.col !== sortedCol[i]!.col) {
            hasInterruption = true;
            break;
          }
        }

        if (!hasInterruption) return true; // pure minijack
      }
    }
  }

  return false;
}

/**
 * Post-process: detect jacks that span cell boundaries.
 *
 * Problem: In chordjack/minijack patterns, each column typically appears
 * only ONCE per beat cell (e.g., 8th-note chordjack at 374 BPM gives
 * 2 notes per beat, but each column hits at most every other 8th).
 * Per-cell detectJack misses these because no column has 2+ notes/cell.
 *
 * Solution: For each "stream" cell, look at a 2-cell window (current + next).
 * Count jack pairs vs total adjacent pairs using the same ratio threshold
 * as detectJack. Reclassify as "jack" only when the ratio is high enough.
 */
export function detectCrossCellJacks(
  cells: CellResult[],
  beatmap: ParsedBeatmap,
): void {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (cell.category !== "stream") continue;

    // Only run on cells with 8th-note subdivision or coarser (denom <= 2).
    // At denom=2, each column appears at most once per cell, so same-column
    // pairs only exist across the cell boundary — cross-cell detection is
    // necessary. At finer subdivisions (denom >= 3), columns can repeat
    // within a cell, and the strict detectJack() handles true minijacks.
    // Applying cross-cell detection at denom >= 4 causes false positives
    // in dense jumpstream/handstream patterns where columns naturally
    // repeat at sub-beat intervals across cell boundaries.
    const subdivDenom = cell.subdivision ?? 4;
    if (subdivDenom > 2) continue;

    // Use a 3-cell window for better jack pair statistics.
    // 2 cells only give 4 same-column candidates at denom=2, which can
    // miss chordjack patterns where columns don't repeat at 1-2× subInterval.
    const endIdx = Math.min(i + 3, cells.length);
    if (endIdx - i < 2) continue;

    // Flatten pre-cached notes from the window cells in one pass, keeping
    // only rice (avoids getNotesInRange calls and repeated concat copies).
    const rice: NoteInfo[] = [];
    for (let w = i; w < endIdx; w++) {
      const src = cells[w]!._notes;
      for (let m = 0; m < src.length; m++) {
        const n = src[m]!;
        if (!n.isLN) rice.push(n);
      }
    }
    if (rice.length < 2) continue;

    // Total adjacent pairs
    const sortedByTime = [...rice].sort((a, b) => a.start - b.start);
    const totalPairs = sortedByTime.length - 1;

    // Per-cell beatLength from active timing point
    const cellBeatLength = getActiveBeatLength(beatmap, cell.startTime);
    const subInterval = cellBeatLength / subdivDenom;
    const tolerance = subInterval * 0.25;

    // Count jack pairs
    const colNotes = new Map<number, NoteInfo[]>();
    for (const n of rice) {
      const arr = colNotes.get(n.col) ?? [];
      arr.push(n);
      colNotes.set(n.col, arr);
    }

    let jackPairs = 0;
    for (const [, notes] of colNotes) {
      if (notes.length < 2) continue;
      const sorted = notes.sort((a, b) => a.start - b.start);
      for (let j = 0; j < sorted.length - 1; j++) {
        const dt = sorted[j + 1]!.start - sorted[j]!.start;
        // Check 1×, 2×, 3×, and 4× subInterval.
        // Chordjack at denom=2 has same-column interval = 4× subInterval
        // (4 notes per cell, one per column, repeated each cell).
        if (Math.abs(dt - subInterval) < tolerance ||
            Math.abs(dt - subInterval * 2) < tolerance ||
            Math.abs(dt - subInterval * 3) < tolerance ||
            Math.abs(dt - subInterval * 4) < tolerance) {
          jackPairs++;
        }
      }
    }

    if (jackPairs / totalPairs >= JACK_RATIO_THRESHOLD) {
      cell.category = "jack";
    }
  }
}

/**
 * Count notes per beat within a cell (sub-beats: 4 per cell at 1/4 reference).
 * Returns [beat0_notes, beat1_notes, beat2_notes, beat3_notes].
 */
export function computeBeatStructure(
  notes: NoteInfo[],
  cellStart: number,
  beatLength: number,
): { structure: number[]; maxBeat: number } {
  const structure = [0, 0, 0, 0];
  const subBeat = beatLength / 4; // 1/16 note
  for (const n of notes) {
    const relTime = n.start - cellStart;
    const idx = Math.min(3, Math.max(0, Math.floor(relTime / subBeat + 0.001)));
    structure[idx]!++;
  }
  const maxBeat = Math.max(...structure);
  return { structure, maxBeat };
}
