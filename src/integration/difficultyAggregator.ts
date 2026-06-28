// ============================================================
// difficultyAggregator.ts — Weighted blend of Sunny Rework
// and Custom density metrics into a final star rating.
// ============================================================

import type { SunnyResult } from "../types/algorithm.js";
import type { PatternSummary } from "../types/patterns.js";
import type { CustomMetrics } from "../types/custom.js";

/**
 * Tunable weighting configuration for the difficulty aggregator.
 * Adjust these to change the balance between Sunny and custom metrics.
 */
export const AGGREGATION_WEIGHTS = {
  /** Weight for Sunny Rework star rating (0-1) */
  sunny: 0.6,
  /** Weight for custom metrics density score (0-1) */
  custom: 0.4,
} as const;

/**
 * Normalize density metrics to a star-rating scale (~0-10+).
 *
 * Formula: (maxDensity + medianDensity * 0.5) / 4
 *
 * Typical density values (notes per 1000ms window):
 *   Easy:    max 5-8    → ~1.5-2.5★
 *   Normal:  max 8-12   → ~2.5-4★
 *   Hard:    max 12-18  → ~4-5.5★
 *   Insane:  max 18-25  → ~5.5-7.5★
 *   Expert:  max 25-35  → ~7.5-10+★
 */
function densityToStar(custom: CustomMetrics): number {
  const { maxDensity, medianDensity } = custom.density.bothHands;
  // Conservative formula: (max*0.6 + med*0.4) / 5
  return (maxDensity * 0.6 + medianDensity * 0.4) / 5;
}

/**
 * Aggregate Sunny Rework and custom metrics into a final blended star rating.
 *
 * Weights are configurable via `AGGREGATION_WEIGHTS`.
 * Sunny is the primary signal; custom density acts as a secondary calibration.
 *
 * @param sunny    - Result from Sunny Rework algorithm.
 * @param _patterns - Pattern summary (reserved for future weighting).
 * @param custom   - Custom metrics (density, jack, stream, etc.).
 * @returns Object with `finalStar` rating.
 */
export function aggregateDifficulty(
  sunny: SunnyResult,
  _patterns: PatternSummary,
  custom: CustomMetrics,
): { finalStar: number } {
  const customStar = densityToStar(custom);

  // If Sunny failed or returned near-zero, fall back to pure density
  if (sunny.star <= 0.01) {
    return { finalStar: customStar };
  }

  const finalStar =
    sunny.star * AGGREGATION_WEIGHTS.sunny +
    customStar * AGGREGATION_WEIGHTS.custom;

  return { finalStar };
}
