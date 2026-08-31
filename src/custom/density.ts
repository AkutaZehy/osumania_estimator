// ============================================================
// Density Metrics — per-column, per-hand, both-hands density
// via sliding window analysis over note timing data.
// ============================================================

import type { DensityMetrics } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import { windowCounts } from "./windowIndex.js";

/**
 * Compute max and median density for a set of note start times
 * by sliding a window of `windowMs` across the timeline,
 * sampling at every note start time.
 *
 * startTimes MUST be sorted ascending (callers sort or rely on file order).
 * Uses the shared two-pointer window index — O(n) total instead of the
 * previous O(n²) per-note full scan (density runs 7× per map).
 */
function computeDensityForTimes(
  startTimes: number[],
  windowMs: number,
): { maxDensity: number; medianDensity: number; meanDensity: number } {
  if (startTimes.length === 0) {
    return { maxDensity: 0, medianDensity: 0, meanDensity: 0 };
  }

  const densities = windowCounts(startTimes, windowMs);

  let maxDensity = 0;
  let sum = 0;
  for (const d of densities) {
    if (d > maxDensity) maxDensity = d;
    sum += d;
  }

  const sorted = [...densities].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDensity =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  const meanDensity = sum / densities.length;

  return { maxDensity, medianDensity, meanDensity };
}

/**
 * Compute full density metrics for a parsed 4K beatmap.
 *
 * @param beatmap  - Parsed beatmap data (must be 4K).
 * @param windowMs - Sliding window width in milliseconds (default 1000).
 * @param speedRate - Rate multiplier (1.0 = nomod). Density counts are
 *   computed on the original map window, then multiplied by speedRate to
 *   express notes per real (modded) second.
 * @returns Density metrics for each column, each hand, and both hands.
 */
export function computeDensityMetrics(
  beatmap: ParsedBeatmap,
  windowMs: number = 1000,
  speedRate: number = 1,
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
  // computeDensityForTimes requires sorted input (two-pointer window)
  for (const arr of columnTimes) arr.sort((a, b) => a - b);

  // Per-column density.
  const perColumn: DensityMetrics["perColumn"] = [];
  for (let col = 0; col < 4; col++) {
    const { maxDensity, medianDensity, meanDensity } = computeDensityForTimes(
      columnTimes[col]!,
      windowMs,
    );
    perColumn.push({
      column: col,
      maxDensity: maxDensity * speedRate,
      medianDensity: medianDensity * speedRate,
      meanDensity: meanDensity * speedRate,
    });
  }

  // Per-hand: left = columns 0-1, right = columns 2-3.
  const leftTimes = [...columnTimes[0]!, ...columnTimes[1]!].sort((a, b) => a - b);
  const rightTimes = [...columnTimes[2]!, ...columnTimes[3]!].sort((a, b) => a - b);

  const left = computeDensityForTimes(leftTimes, windowMs);
  const right = computeDensityForTimes(rightTimes, windowMs);

  // Both hands: all four columns combined.
  const allTimes = [...leftTimes, ...rightTimes].sort((a, b) => a - b);
  const bothHands = computeDensityForTimes(allTimes, windowMs);

  const scale = (m: { maxDensity: number; medianDensity: number; meanDensity: number }) => ({
    maxDensity: m.maxDensity * speedRate,
    medianDensity: m.medianDensity * speedRate,
    meanDensity: m.meanDensity * speedRate,
  });

  return {
    perColumn,
    perHand: { left: scale(left), right: scale(right) },
    bothHands: scale(bothHands),
  };
}
