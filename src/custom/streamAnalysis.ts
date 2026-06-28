// ============================================================
// Stream Analysis — JS vs HS classification, density grading,
// multi-scale hand imbalance, and broken stream detection.
// ============================================================

import type { StreamMetrics } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import { createChart } from "../parser/chartBuilder.js";
import { calculatePrimitives } from "../patterns/primitives.js";
import type { PrimitiveRow } from "../types/primitives.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEFT_COLS = new Set([0, 1]);
const RIGHT_COLS = new Set([2, 3]);

// ---------------------------------------------------------------------------
// Stream type classification (unchanged)
// ---------------------------------------------------------------------------

/**
 * Classify the stream type based on per-row note counts in any 4-row window.
 *
 * - If any window has a row with 3+ notes → HS (Handstream)  … ≥10% prevalence
 * - else if any window has a row with 2 notes  → JS (Jumpstream) … ≥10% prevalence
 * - else → Stream (single stream)
 */
function classifyStreamType(
  primitives: PrimitiveRow[],
): "JumpStream" | "HandStream" | "Stream" | null {
  if (primitives.length === 0) return null;

  let totalRows = 0;
  let twoPlusRows = 0;
  let threePlusRows = 0;

  for (const row of primitives) {
    if (row.rawNotes.length === 0) continue;
    totalRows++;
    if (row.jacks > 0) continue; // skip jack rows
    if (row.rawNotes.length >= 3) threePlusRows++;
    if (row.rawNotes.length >= 2) twoPlusRows++;
  }

  if (totalRows === 0) return null;
  const twoPct = twoPlusRows / totalRows;
  const threePct = threePlusRows / totalRows;

if (threePct >= 0.05) return "HandStream";
if (twoPct >= 0.10) return "JumpStream";
return "Stream";
}

// ---------------------------------------------------------------------------
// Stream density grading (unchanged — skips jacks)
// ---------------------------------------------------------------------------

/**
 * Compute the maximum total notes in any 4-row sliding window
 * and grade the density.
 *
 * Grading scale (average notes per row):
 *   1.0       → "Single"
 *   1.0–1.25 → "Light"
 *   1.25–1.5 → "Mid"
 *   1.5–2.0  → "Dense"
 *   2.0+     → "Heavy"
 */
function gradeStreamDensity(primitives: PrimitiveRow[]): string | null {
  if (primitives.length === 0) return null;

  const windowCounts: number[] = [];
  for (let i = 0; i < primitives.length; i++) {
    let windowNotes = 0;
    const end = Math.min(i + 4, primitives.length);
    for (let j = i; j < end; j++) {
      const row = primitives[j]!;
      if (row.jacks > 0) continue; // skip jack rows
      windowNotes += row.rawNotes.length;
    }
    windowCounts.push(windowNotes);
  }
  windowCounts.sort((a, b) => b - a); // descending, P90 = top 10%
  const idx = Math.max(0, Math.floor(windowCounts.length * 0.1));
  const maxWindowNotes = windowCounts[idx]!;

  if (maxWindowNotes === 0) return "Empty";
  const avgPerRow = maxWindowNotes / 4;

  // Get P50 for dual display
  const medIdx = Math.max(0, Math.floor(windowCounts.length / 2));
  const medWindowNotes = windowCounts[medIdx]!;
  const m = maxWindowNotes.toFixed(1);
  const d = medWindowNotes.toFixed(1);

  if (avgPerRow <= 1.0) return `Single (${m}/${d})`;
  if (avgPerRow <= 1.25) return `Light (${m}/${d})`;
  if (avgPerRow <= 1.5) return `Mid (${m}/${d})`;
  if (avgPerRow <= 2.0) return `Dense (${m}/${d})`;
  return `Heavy (${m}/${d})`;
}

// ---------------------------------------------------------------------------
// Multi-scale stream hand imbalance
// ---------------------------------------------------------------------------

/** Imbalance ratio: max(side) / sum.  0.5 = balanced, 1.0 = fully biased. */
function imbalanceRatio(leftCount: number, rightCount: number): number {
  const total = leftCount + rightCount;
  if (total === 0) return 0;
  return Math.max(leftCount, rightCount) / total;
}

/**
 * Count left vs right notes across `windowSize` rows starting at `startIdx`
 * and return the imbalance ratio.
 */
function streamImbalanceForWindow(
  primitives: PrimitiveRow[],
  startIdx: number,
  windowSize: number,
): number {
  const end = Math.min(startIdx + windowSize, primitives.length);
  let leftNotes = 0;
  let rightNotes = 0;

  for (let i = startIdx; i < end; i++) {
    for (const col of primitives[i]!.rawNotes) {
      if (LEFT_COLS.has(col)) leftNotes++;
      else if (RIGHT_COLS.has(col)) rightNotes++;
    }
  }

  // Require minimum note count to avoid sparse-section noise giving false 1.00
  if (leftNotes + rightNotes < 3) return 0;
  return imbalanceRatio(leftNotes, rightNotes);
}

/** Stream imbalance across 4-row windows. Returns average of top 25%. */
function streamImbalance4r(primitives: PrimitiveRow[]): number {
  if (primitives.length < 4) return 0;

  const ratios: number[] = [];
  for (let i = 0; i <= primitives.length - 4; i++) {
    const ratio = streamImbalanceForWindow(primitives, i, 4);
    if (ratio > 0) ratios.push(ratio);
  }
  return topQuarterAvg(ratios);
}

/** Stream imbalance across 16-row windows. Returns average of top 25%. */
function streamImbalance16r(primitives: PrimitiveRow[]): number {
  if (primitives.length < 16) return 0;

  const ratios: number[] = [];
  for (let i = 0; i <= primitives.length - 16; i++) {
    const ratio = streamImbalanceForWindow(primitives, i, 16);
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

/** Overall stream imbalance across the entire map. */
function streamImbalanceTotal(primitives: PrimitiveRow[]): number {
  if (primitives.length === 0) return 0;

  let leftNotes = 0;
  let rightNotes = 0;

  for (const row of primitives) {
    for (const col of row.rawNotes) {
      if (LEFT_COLS.has(col)) leftNotes++;
      else if (RIGHT_COLS.has(col)) rightNotes++;
    }
  }

  return Math.round(imbalanceRatio(leftNotes, rightNotes) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Broken stream detection
// ---------------------------------------------------------------------------

/**
 * Slide a 2-row window across all primitives and collect the total note
 * count in each window.  Returns the maximum and median density.
 */
function brokenStream(primitives: PrimitiveRow[]): {
  max: number;
  med: number;
} {
  if (primitives.length < 2) return { max: 0, med: 0 };

  const densities: number[] = [];
  for (let i = 0; i < primitives.length; i++) {
    let windowNotes = 0;
    const end = Math.min(i + 2, primitives.length);
    for (let j = i; j < end; j++) {
      windowNotes += primitives[j]!.rawNotes.length;
    }
    densities.push(windowNotes);
  }

  densities.sort((a, b) => a - b);
  const mid = Math.floor(densities.length / 2);
  const med =
    densities.length % 2 === 0
      ? (densities[mid - 1]! + densities[mid]!) / 2
      : densities[mid]!;

  return {
    max: densities[densities.length - 1]!,
    med: Math.round(med * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute full stream-specific metrics for a parsed 4K beatmap.
 *
 * @param beatmap - Parsed beatmap data.
 * @param _density - Pre-computed density metrics (unused directly here).
 * @returns StreamMetrics with classification, density grade,
 *          multi-scale imbalance, and broken stream density.
 */
export function computeStreamMetrics(
  beatmap: ParsedBeatmap,
  _density: unknown,
): StreamMetrics {
  const chart = createChart(beatmap);
  const primitives = calculatePrimitives(chart);

  if (!primitives.length || beatmap.noteStarts.length === 0) {
    return {
      streamType: null,
      densityGrade: null,
      imbalance4r: 0,
      imbalance16r: 0,
      imbalanceTotal: 0,
      brokenMax: 0,
      brokenMed: 0,
    };
  }

  // Detect jack dominance — if most rows are jacks, stream metrics are less reliable
  let totalRows = 0;
  let jackRows = 0;
  for (const row of primitives) {
    if (row.rawNotes.length === 0) continue;
    totalRows++;
    if (row.jacks > 0) jackRows++;
  }
  const jackRatio = totalRows > 0 ? jackRows / totalRows : 0;

  let streamType = classifyStreamType(primitives);
  let densityGrade = gradeStreamDensity(primitives);

  // If jack-dominant (>60% rows are jacks), stream classification is inflated by filler notes
  if (jackRatio > 0.4) {
    // Downgrade: remove chord-based types since they're likely jack artifacts
    if (streamType === "HandStream") streamType = "JumpStream";
    else if (streamType === "JumpStream") streamType = "Stream";
  }
  const bs = brokenStream(primitives);

  return {
    streamType,
    densityGrade,
    imbalance4r: streamImbalance4r(primitives),
    imbalance16r: streamImbalance16r(primitives),
    imbalanceTotal: streamImbalanceTotal(primitives),
    brokenMax: bs.max,
    brokenMed: bs.med,
  };
}

