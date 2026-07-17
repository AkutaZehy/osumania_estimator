// ============================================================
// Density Metrics — per-column, per-hand, both-hands density
// via sliding window analysis over note timing data.
// ============================================================

import type { DensityMetrics } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";

/**
 * Compute max and median density for a set of note start times
 * by sliding a window of `windowMs` across the timeline,
 * sampling at every note start time.
 */
function computeDensityForTimes(
  startTimes: number[],
  windowMs: number,
): { maxDensity: number; medianDensity: number; meanDensity: number } {
  if (startTimes.length === 0) {
    return { maxDensity: 0, medianDensity: 0, meanDensity: 0 };
  }

  const densities: number[] = [];

  for (const t of startTimes) {
    const windowEnd = t + windowMs;
    let count = 0;
    for (const st of startTimes) {
      if (st >= t && st < windowEnd) count++;
    }
    densities.push(count);
  }

  const maxDensity = Math.max(...densities);

  const sorted = [...densities].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDensity =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  const meanDensity = densities.reduce((a, b) => a + b, 0) / densities.length;

  return { maxDensity, medianDensity, meanDensity };
}

/**
 * Compute full density metrics for a parsed 4K beatmap.
 *
 * @param beatmap  - Parsed beatmap data (must be 4K).
 * @param windowMs - Sliding window width in milliseconds (default 1000).
 * @returns Density metrics for each column, each hand, and both hands.
 */
export function computeDensityMetrics(
  beatmap: ParsedBeatmap,
  windowMs: number = 1000,
): DensityMetrics {
  const { columns, noteStarts } = beatmap;
  const n = noteStarts.length;

  // Extract start times per column (0-3 for 4K).
  const columnTimes: number[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const col = columns[i]!;
    if (col >= 0 && col < 4) {
      columnTimes[col]!.push(noteStarts[i]!);
    }
  }

  // Per-column density.
  const perColumn: DensityMetrics["perColumn"] = [];
  for (let col = 0; col < 4; col++) {
    const { maxDensity, medianDensity, meanDensity } = computeDensityForTimes(
      columnTimes[col]!,
      windowMs,
    );
    perColumn.push({ column: col, maxDensity, medianDensity, meanDensity });
  }

  // Per-hand: left = columns 0-1, right = columns 2-3.
  const leftTimes = [...columnTimes[0]!, ...columnTimes[1]!].sort((a, b) => a - b);
  const rightTimes = [...columnTimes[2]!, ...columnTimes[3]!].sort((a, b) => a - b);

  const left = computeDensityForTimes(leftTimes, windowMs);
  const right = computeDensityForTimes(rightTimes, windowMs);

  // Both hands: all four columns combined.
  const allTimes = [...leftTimes, ...rightTimes].sort((a, b) => a - b);
  const bothHands = computeDensityForTimes(allTimes, windowMs);

  return {
    perColumn,
    perHand: { left, right },
    bothHands,
  };
}
