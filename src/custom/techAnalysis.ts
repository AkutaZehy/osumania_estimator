// ============================================================
// Tech Analysis — burst KPS detection, grace/flam detection,
// roll/trill classification from primitive data.
// ============================================================

import type { TechMetrics, RollTrillStats } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import type { PatternSummary } from "../types/patterns.js";
import { createChart } from "../parser/chartBuilder.js";
import { calculatePrimitives } from "../patterns/primitives.js";
import type { PrimitiveRow } from "../types/primitives.js";
import { Direction } from "../types/primitives.js";

// ---------------------------------------------------------------------------
// Burst KPS helpers (unchanged)
// ---------------------------------------------------------------------------

/**
 * Max KPS (notes per second) across all columns.
 * Slides a window of `windowMs` across note start times and finds the peak.
 */
function maxKPS(times: number[], windowMs: number): number {
  if (times.length === 0) return 0;

  let maxCount = 0;
  for (let i = 0; i < times.length; i++) {
    const windowEnd = times[i]! + windowMs;
    let count = 0;
    for (let j = i; j < times.length && times[j]! < windowEnd; j++) {
      count++;
    }
    if (count > maxCount) maxCount = count;
  }

  return (maxCount / windowMs) * 1000;
}

function singleFingerMaxKPS(beatmap: ParsedBeatmap): number {
  const { columns, noteStarts } = beatmap;
  const n = noteStarts.length;
  if (n === 0) return 0;

  const colTimes: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const col = columns[i]!;
    if (col >= 0 && col < 4) {
      colTimes[col]!.push(noteStarts[i]!);
    }
  }

  const windowMs = 500;
  let best = 0;
  for (const times of colTimes) {
    const kps = maxKPS(times, windowMs);
    if (kps > best) best = kps;
  }
  return Math.round(best * 100) / 100;
}

function oneHandMaxKPS(beatmap: ParsedBeatmap): number {
  const { columns, noteStarts } = beatmap;
  const n = noteStarts.length;
  if (n === 0) return 0;

  const leftTimes: number[] = [];
  const rightTimes: number[] = [];

  for (let i = 0; i < n; i++) {
    const col = columns[i]!;
    if (col === 0 || col === 1) leftTimes.push(noteStarts[i]!);
    else if (col === 2 || col === 3) rightTimes.push(noteStarts[i]!);
  }

  leftTimes.sort((a, b) => a - b);
  rightTimes.sort((a, b) => a - b);

  const windowMs = 500;
  const leftKPS = maxKPS(leftTimes, windowMs);
  const rightKPS = maxKPS(rightTimes, windowMs);

  return Math.round(Math.max(leftKPS, rightKPS) * 100) / 100;
}

function bothHandsMaxKPS(beatmap: ParsedBeatmap): number {
  const times = [...beatmap.noteStarts].sort((a, b) => a - b);
  const windowMs = 500;
  const kps = maxKPS(times, windowMs);
  return Math.round(kps * 100) / 100;
}

// ---------------------------------------------------------------------------
// Grace/flam detection (unchanged)
// ---------------------------------------------------------------------------

function detectGraces(primitives: PrimitiveRow[]): number {
  if (primitives.length < 2) return 0;

  let graceCount = 0;

  for (let i = 1; i < primitives.length; i++) {
    const prev = primitives[i - 1]!;
    const curr = primitives[i]!;

    const timeGap = curr.msPerBeat / 4.0;
    if (timeGap > 50) continue;

    const prevCols = new Set(prev.rawNotes);
    const currCols = new Set(curr.rawNotes);

    let hasGrace = false;
    for (const c of currCols) {
      if (!prevCols.has(c)) {
        hasGrace = true;
        break;
      }
    }
    if (!hasGrace) {
      for (const c of prevCols) {
        if (!currCols.has(c)) {
          hasGrace = true;
          break;
        }
      }
    }

    if (hasGrace) graceCount++;
  }

  return graceCount;
}

// ---------------------------------------------------------------------------
// Roll / Trill detection
// ---------------------------------------------------------------------------

/**
 * Map msPerBeat to a note-division label.
 * Uses the row's own beatLength as reference:
 *   msPerBeat = Δt × 4.0, and for 16th notes Δt = beatLength/4
 *   → msPerBeat ≈ beatLength → "16"
 *
 * Ratios:
 *   4.0  → quarter   ("4")
 *   2.0  → eighth    ("8")
 *   1.0  → 16th      ("16")
 *   0.67 → 24th      ("24")
 *   0.5  → 32nd      ("32")
 */
function divisionLabel(row: PrimitiveRow): string {
  if (row.beatLength <= 0) return "16"; // fallback
  const r = row.msPerBeat / row.beatLength;

  if (r > 3.0) return "4";
  if (r > 1.5) return "8";
  if (r > 0.8) return "16";
  if (r > 0.58) return "24";
  return "32";
}

/**
 * Detect roll and trill patterns from PrimitiveRow data.
 *
 * - Rolls: consecutive rows where Direction is consistently LEFT or RIGHT.
 *   Grouped by note division; records the max consecutive length.
 * - Trills: alternating two-column patterns (a-b-a-b).
 *   Total count grouped by note division.
 */
function computeRollTrillStats(
  _beatmap: ParsedBeatmap,
  _patterns: PatternSummary,
): RollTrillStats {
  const chart = createChart(_beatmap);
  const primitives = calculatePrimitives(chart);

  if (primitives.length < 2) return { rolls: "", trills: '' };

  // ---- Roll detection ----
  // max consecutive same-direction runs, keyed by division label.
  const rollMax: Map<string, number> = new Map();

  let runDir: Direction | null = null;
  let runLen = 0;
  let runDiv = "";

  function flushRollRun(): void {
    if (runLen >= 2 && runDiv) {
      const prev = rollMax.get(runDiv) ?? 0;
      if (runLen > prev) rollMax.set(runDiv, runLen);
    }
  }

  for (let i = 1; i < primitives.length; i++) {
    const dir = primitives[i]!.direction;
    const div = divisionLabel(primitives[i]!);

    if (
      (dir === Direction.LEFT || dir === Direction.RIGHT) &&
      dir === runDir
    ) {
      runLen++;
      // Use the minority division? Keep the first division of the run.
    } else {
      flushRollRun();
      if (dir === Direction.LEFT || dir === Direction.RIGHT) {
        runDir = dir;
        runLen = 2; // we already have row i-1 and row i
        runDiv = div;
      } else {
        runDir = null;
        runLen = 0;
        runDiv = "";
      }
    }
  }
  flushRollRun();

  // ---- Trill detection ----
  // An a-b-a-b trill: consecutive rows alternate between exactly two columns.
  const trillCount: Map<string, number> = new Map();

  let trillCols: [number, number] | null = null;
  let trillLen = 0;
  let trillDiv = "";

  function flushTrillRun(): void {
    if (trillLen >= 3 && trillDiv) {
      const prev = trillCount.get(trillDiv) ?? 0;
      trillCount.set(trillDiv, prev + trillLen);
    }
  }

  for (let i = 1; i < primitives.length; i++) {
    const prevNotes = primitives[i - 1]!.rawNotes;
    const currNotes = primitives[i]!.rawNotes;
    const div = divisionLabel(primitives[i]!);

    // Trill must have exactly 1 note per row.
    if (prevNotes.length === 1 && currNotes.length === 1) {
      const pair: [number, number] = [prevNotes[0]!, currNotes[0]!];

      if (
        trillCols &&
        pair[0] === trillCols[1] &&
        pair[1] === trillCols[0]
      ) {
        // Alternating: continues the trill.
        trillLen++;
        trillCols = pair;
      } else if (
        trillCols &&
        pair[0] === trillCols[0] &&
        pair[1] === trillCols[1]
      ) {
        // Same pair again (not alternating properly) — still a trill?
        // Treat as continuation.
        trillLen++;
        trillCols = pair;
      } else {
        flushTrillRun();
        // Start new trill only if columns differ.
        if (pair[0] !== pair[1]) {
          trillCols = pair;
          trillLen = 2;
          trillDiv = div;
        } else {
          trillCols = null;
          trillLen = 0;
          trillDiv = "";
        }
      }
    } else {
      flushTrillRun();
      trillCols = null;
      trillLen = 0;
      trillDiv = "";
    }
  }
  flushTrillRun();

  // ---- Build rolls/trills strings (labels come from display) ----
  let rollsStr = "";
  let trillsStr = "";

  if (rollMax.size > 0) {
    const rollParts: string[] = [];
    for (const [div, max] of [...rollMax.entries()].sort((a, b) => {
      const order = ["4", "8", "16", "24", "32"];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })) {
      rollParts.push(`${max}\u00d7${div}`);
    }
    rollsStr = rollParts.join(" ");
  }

  if (trillCount.size > 0) {
    const trillParts: string[] = [];
    for (const [div, cnt] of [...trillCount.entries()].sort((a, b) => {
      const order = ["4", "8", "16", "24", "32"];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })) {
      trillParts.push(`${cnt}\u00d7${div}`);
    }
    trillsStr = trillParts.join(" ");
  }

  return { rolls: rollsStr, trills: trillsStr };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute full tech-specific metrics for a parsed 4K beatmap.
 *
 * Burst KPS is computed using a 500ms window across note timings.
 * Grace/flam detection uses primitive row intervals.
 * Roll/trill statistics are derived from primitive row directions and columns.
 *
 * @param beatmap   - Parsed beatmap data.
 * @param patterns  - Pattern analysis summary.
 * @returns TechMetrics with burst KPS, grace count, and roll/trill stats.
 */
export function computeTechMetrics(
  beatmap: ParsedBeatmap,
  patterns: PatternSummary,
): TechMetrics {
  if (beatmap.noteStarts.length === 0) {
    return {
      graceCount: 0,
      rollTrill: { rolls: "", trills: "" },
      burst: {
        singleFingerMaxKPS: 0,
        oneHandMaxKPS: 0,
        bothHandsMaxKPS: 0,
      },
    };
  }

  const chart = createChart(beatmap);
  const primitives = calculatePrimitives(chart);

  const sfKPS = singleFingerMaxKPS(beatmap);
  const ohKPS = oneHandMaxKPS(beatmap);
  const bhKPS = bothHandsMaxKPS(beatmap);
  const graceCount = detectGraces(primitives);
  const rollTrill = computeRollTrillStats(beatmap, patterns);

  return {
    graceCount,
    rollTrill,
    burst: {
      singleFingerMaxKPS: sfKPS,
      oneHandMaxKPS: ohKPS,
      bothHandsMaxKPS: bhKPS,
    },
  };
}


