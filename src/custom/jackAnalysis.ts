// ============================================================
// Jack Analysis — jack density grading, anchor detection,
// finger/hand pressure, multi-scale hand imbalance, and vibro.
// ============================================================

import type { JackMetrics, DensityMetrics } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import { createChart } from "../parser/chartBuilder.js";
import { calculatePrimitives } from "../patterns/primitives.js";
import type { PrimitiveRow } from "../types/primitives.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Columns owned by each hand, 0-indexed. */
const LEFT_COLS = new Set([0, 1]);
const RIGHT_COLS = new Set([2, 3]);

/**
 * Return the columns that have jack notes between two consecutive rows.
 * A column is a jack column when it appears in both rows.
 */
function jackColumnsBetween(
  prev: PrimitiveRow,
  curr: PrimitiveRow,
): number[] {
  const result: number[] = [];
  for (const col of curr.rawNotes) {
    if (prev.rawNotes.includes(col)) result.push(col);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Density grading (unchanged)
// ---------------------------------------------------------------------------

/**
 * Grade the jack density based on the maximum total notes found in any
 * 4-row sliding window. Higher totals mean denser jack patterns.
 *
 * Grading scale:
 *   4      → "Mini"     (1 note/row average — minijacks)
 *   5-7    → "Low"      (light jack density)
 *   8-11   → "Mid"      (moderate jacks)
 *   12-16  → "Dense"    (heavy chordjacks)
 */
function gradeJackDensity(maxWindowNotes: number, medWindowNotes: number): string | null {
  const m = maxWindowNotes.toFixed(1);
  const d = medWindowNotes.toFixed(1);
  if (maxWindowNotes <= 4) return `Mini (${m}/${d})`;
  if (maxWindowNotes <= 7) return `Low (${m}/${d})`;
  if (maxWindowNotes <= 11) return `Mid (${m}/${d})`;
  return `Dense (${m}/${d})`;
}

/** Slide a 4-row window and return the 90th-percentile note count. */
function max4RowDensity(primitives: PrimitiveRow[]): number {
  if (primitives.length === 0) return 0;

  const windowCounts: number[] = [];
  for (let i = 0; i < primitives.length; i++) {
    let windowNotes = 0;
    const end = Math.min(i + 4, primitives.length);
    for (let j = i; j < end; j++) {
      windowNotes += primitives[j]!.rawNotes.length;
    }
    windowCounts.push(windowNotes);
  }
  windowCounts.sort((a, b) => b - a); // descending, P90 = top 10%
  const idx = Math.max(0, Math.floor(windowCounts.length * 0.1));
  return windowCounts[idx]!;
}

/** Return P50 (median) of 4-row window counts. */
function med4RowDensity(primitives: PrimitiveRow[]): number {
  if (primitives.length === 0) return 0;

  const windowCounts: number[] = [];
  for (let i = 0; i < primitives.length; i++) {
    let windowNotes = 0;
    const end = Math.min(i + 4, primitives.length);
    for (let j = i; j < end; j++) {
      windowNotes += primitives[j]!.rawNotes.length;
    }
    windowCounts.push(windowNotes);
  }
  windowCounts.sort((a, b) => a - b);
  return windowCounts[Math.floor(windowCounts.length / 2)]!;
}

// ---------------------------------------------------------------------------
// Anchor counting (unchanged)
// ---------------------------------------------------------------------------

/**
 * Count anchor patterns: 3+ consecutive same-column notes at jack-like speed.
 * Requires time gaps between consecutive same-column notes to be ≤ maxGapMs.
 * Prevents normal stream from being counted as anchors.
 */
function countAnchors(
  _beatmap: ParsedBeatmap,
  primitives: PrimitiveRow[],
): number {
  if (primitives.length === 0) return 0;

  const rowCols = primitives.map((p) => new Set(p.rawNotes));
  const rowTimes = primitives.map((p) => p.time);
  const rowBeatLengths = primitives.map((p) => p.beatLength);

  let anchorCount = 0;

  for (let col = 0; col < 4; col++) {
    let consecutive = 0;
    let prevTime = -1;

    for (let i = 0; i < rowCols.length; i++) {
      if (rowCols[i]!.has(col)) {
        const t = rowTimes[i]!;
        const maxGap = (rowBeatLengths[i] ?? 500) * 2;
        // Only count as consecutive if gap is within anchor speed threshold
        if (prevTime < 0 || (t - prevTime) <= maxGap) {
          consecutive++;
        } else {
          if (consecutive >= 3) anchorCount++;
          consecutive = 1;
        }
        prevTime = t;
      } else {
        if (consecutive >= 3) anchorCount++;
        consecutive = 0;
        prevTime = -1;
      }
    }
    if (consecutive >= 3) anchorCount++;
  }

  return anchorCount;
}

// ---------------------------------------------------------------------------
// Finger / hand pressure (unchanged)
// ---------------------------------------------------------------------------

function singleFingerPressure(density: DensityMetrics): number {
  if (density.bothHands.maxDensity === 0) return 0;
  const maxCol = Math.max(
    ...density.perColumn.map((c) => c.maxDensity),
  );
  return maxCol / density.bothHands.maxDensity;
}

function singleHandPressure(density: DensityMetrics): number {
  if (density.bothHands.maxDensity === 0) return 0;
  const maxHand = Math.max(
    density.perHand.left.maxDensity,
    density.perHand.right.maxDensity,
  );
  return maxHand / density.bothHands.maxDensity;
}

// ---------------------------------------------------------------------------
// Multi-scale jack hand imbalance
// ---------------------------------------------------------------------------

/** Imbalance ratio: max(side) / sum.  0.5 = balanced, 1.0 = fully biased. */
function imbalanceRatio(leftCount: number, rightCount: number): number {
  const total = leftCount + rightCount;
  if (total === 0) return 0;
  return Math.max(leftCount, rightCount) / total;
}

/**
 * For a window of `windowSize` rows, accumulate jack counts per hand
 * and return the imbalance ratio.
 */
function jackImbalanceForWindow(
  primitives: PrimitiveRow[],
  startIdx: number,
  windowSize: number,
): number {
  const end = Math.min(startIdx + windowSize, primitives.length);
  let leftJacks = 0;
  let rightJacks = 0;

  for (let i = startIdx + 1; i < end; i++) {
    const cols = jackColumnsBetween(primitives[i - 1]!, primitives[i]!);
    for (const col of cols) {
      if (LEFT_COLS.has(col)) leftJacks++;
      else if (RIGHT_COLS.has(col)) rightJacks++;
    }
  }

  // Require minimum jack count to avoid sparse-section noise
  if (leftJacks + rightJacks < 3) return 0;
  return imbalanceRatio(leftJacks, rightJacks);
}

/**
 * Jack imbalance across 4-row windows.
 * Returns the average of top 25% imbalance ratios (avoids single-outlier 1.00).
 */
function jackImbalance4r(primitives: PrimitiveRow[]): number {
  if (primitives.length < 4) return 0;

  const ratios: number[] = [];
  for (let i = 0; i <= primitives.length - 4; i++) {
    const ratio = jackImbalanceForWindow(primitives, i, 4);
    if (ratio > 0) ratios.push(ratio);
  }
  return topQuarterAvg(ratios);
}

/**
 * Jack imbalance across 16-row windows.
 * Returns the average of top 25% imbalance ratios.
 */
function jackImbalance16r(primitives: PrimitiveRow[]): number {
  if (primitives.length < 16) return 0;

  const ratios: number[] = [];
  for (let i = 0; i <= primitives.length - 16; i++) {
    const ratio = jackImbalanceForWindow(primitives, i, 16);
    if (ratio > 0) ratios.push(ratio);
  }
  return topQuarterAvg(ratios);
}

/** Average of top 25% values (sorted descending). */
function topQuarterAvg(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => b - a);
  const n = Math.max(1, Math.ceil(sorted.length / 4));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i]!;
  return Math.round((sum / n) * 1000) / 1000;
}

/**
 * Overall jack imbalance across the entire map.
 */
function jackImbalanceTotal(primitives: PrimitiveRow[]): number {
  if (primitives.length < 2) return 0;

  let leftJacks = 0;
  let rightJacks = 0;

  for (let i = 1; i < primitives.length; i++) {
    const cols = jackColumnsBetween(primitives[i - 1]!, primitives[i]!);
    for (const col of cols) {
      if (LEFT_COLS.has(col)) leftJacks++;
      else if (RIGHT_COLS.has(col)) rightJacks++;
    }
  }

  return Math.round(imbalanceRatio(leftJacks, rightJacks) * 1000) / 1000;
}

/**
 * Determine if all jack activity is biased to a single hand.
 * True when every jack column belongs exclusively to one hand.
 */
function isBias(primitives: PrimitiveRow[]): boolean {
  if (primitives.length < 2) return false;

  let sawLeft = false;
  let sawRight = false;

  for (let i = 1; i < primitives.length; i++) {
    const cols = jackColumnsBetween(primitives[i - 1]!, primitives[i]!);
    for (const col of cols) {
      if (LEFT_COLS.has(col)) sawLeft = true;
      else if (RIGHT_COLS.has(col)) sawRight = true;
    }
  }

  // Bias = only one hand ever has jacks (or no jacks at all → not biased).
  return (sawLeft && !sawRight) || (!sawLeft && sawRight);
}

// ---------------------------------------------------------------------------
// Vibro detection (tightened thresholds)
// ---------------------------------------------------------------------------

/**
 * Determine if this is vibro-style gameplay (jacks at very high speed).
 * Tightened: Dense grade + ≥5 anchors, OR Mid grade + ≥8 anchors.
 */
function detectVibro(
  densityGrade: string | null,
  anchorCount: number,
  singleFingerPressure: number,
  primitives: PrimitiveRow[],
): boolean {
  // Per-column actual MAX density in 4-row windows (not P90 — vibro is about peaks)
  let perColMax = 0;
  for (let c = 0; c < 4; c++) {
    let best = 0;
    for (let i = 0; i < primitives.length; i++) {
      let cnt = 0;
      const end = Math.min(i + 4, primitives.length);
      for (let j = i; j < end; j++) {
        if (primitives[j]!.rawNotes.includes(c)) cnt++;
      }
      if (cnt > best) best = cnt;
    }
    if (best > perColMax) perColMax = best;
  }

  // Vibro: sustained single-column jacks (using actual MAX, not P90)
  if (perColMax >= 4 && anchorCount >= 3) return true;
  if (perColMax >= 3 && anchorCount >= 5) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute full jack-specific metrics for a parsed 4K beatmap.
 *
 * @param beatmap  - Parsed beatmap data.
 * @param density  - Pre-computed density metrics.
 * @returns JackMetrics with density grade, anchor count, pressure scores,
 *          multi-scale imbalance, bias flag, and vibro flag.
 */
export function computeJackMetrics(beatmap: ParsedBeatmap, density: DensityMetrics, speedRate = 1): JackMetrics {
  const chart = createChart(beatmap);
  const primitives = calculatePrimitives(chart, speedRate);

  if (!primitives.length || beatmap.noteStarts.length === 0) {
    return {
      densityGrade: null,
      anchorCount: 0,
      singleFingerPressure: 0,
      singleHandPressure: 0,
      imbalance4r: 0,
      imbalance16r: 0,
      imbalanceTotal: 0,
      isBias: false,
      isVibro: false,
    };
  }

  const maxDensity = max4RowDensity(primitives);
  const medDensity = med4RowDensity(primitives);
  const densityGrade = gradeJackDensity(maxDensity, medDensity);
  const anchorCount = countAnchors(beatmap, primitives);
  const sfp = singleFingerPressure(density);
  const shp = singleHandPressure(density);

  return {
    densityGrade,
    anchorCount,
    singleFingerPressure: Math.round(sfp * 1000) / 1000,
    singleHandPressure: Math.round(shp * 1000) / 1000,
    imbalance4r: jackImbalance4r(primitives),
    imbalance16r: jackImbalance16r(primitives),
    imbalanceTotal: jackImbalanceTotal(primitives),
    isBias: isBias(primitives),
    isVibro: false, // disabled — needs Etterna JackSpeed for reliable detection
  };
}






