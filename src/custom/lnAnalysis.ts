// ============================================================
// LN Analysis — Long Note ratio, release difficulty,
// and LN-specific pattern detection (shield, column lock, inverse).
// ============================================================

import type { LNMetrics } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import type { SunnyResult } from "../types/algorithm.js";
import type { PatternSummary } from "../types/patterns.js";

/**
 * Compute release difficulty from Sunny Rework Rbar values.
 * Rbar ≤ 1, where lower values = harder to release.
 * We invert and average to get a difficulty score.
 */
function releaseDifficulty(sunny: SunnyResult): number {
  if (!sunny.bars || sunny.bars.length === 0) return 0;

  let sum = 0;
  let count = 0;

  for (const bar of sunny.bars) {
    // rbar ≤ 1; lower = harder.
    // Convert: difficulty = 1 - rbar (so higher = harder).
    sum += 1 - bar.rbar;
    count++;
  }

  if (count === 0) return 0;

  const avg = sum / count;
  return Math.round(avg * 10000) / 10000;
}

/**
 * Count shield patterns from PatternSummary clusters.
 * Looks for "Shield" in specific type names.
 */
function countShields(patterns: PatternSummary): number {
  let count = 0;
  for (const cluster of patterns.clusters) {
    for (const [name] of cluster.specificTypes) {
      if (name === "Shield") {
        count++;
      }
    }
  }
  return count;
}

/**
 * Count column lock patterns from PatternSummary clusters.
 * Looks for "Column Lock" in specific type names.
 */
function countColumnLocks(patterns: PatternSummary): number {
  let count = 0;
  for (const cluster of patterns.clusters) {
    for (const [name] of cluster.specificTypes) {
      if (name === "Column Lock") {
        count++;
      }
    }
  }
  return count;
}

/**
 * Count inverse patterns from PatternSummary clusters.
 * Looks for "Inverse" in specific type names.
 */
function countInverses(patterns: PatternSummary): number {
  let count = 0;
  for (const cluster of patterns.clusters) {
    for (const [name] of cluster.specificTypes) {
      if (name === "Inverse") {
        count++;
      }
    }
  }
  return count;
}

/**
 * Compute LN-specific metrics for a parsed 4K beatmap.
 *
 * Release difficulty is derived from Sunny Rework's Rbar strain values:
 *   difficulty = 1 - average(rbar)  (higher = harder releases)
 *
 * Shield, column lock, and inverse counts come from PatternSummary
 * cluster detection data.
 *
 * @param beatmap   - Parsed beatmap data.
 * @param sunny     - Sunny Rework algorithm result.
 * @param patterns  - Pattern analysis summary.
 * @returns LNMetrics with ratio, release difficulty, and pattern counts.
 */
export function computeLNMetrics(parsed: ParsedBeatmap, sunny: SunnyResult, patterns: PatternSummary, speedRate = 1) {
  const ratio = parsed.lnRatio;

  const release = releaseDifficulty(sunny);
  const shieldCount = countShields(patterns);
  const columnLockCount = countColumnLocks(patterns);
  const inverseCount = countInverses(patterns);

  return {
    ratio,
    releaseDifficulty: release,
    shieldCount,
    columnLockCount,
    inverseCount,
  };
}






