// ============================================================
// Equivalent BPM — dynamic BPM adjustment based on pattern type
// Simplified: uses division from beat-grid-aware clustering
// instead of re-analyzing primitive-level note intervals.
// ============================================================

import type { EquivalentBPM } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import type { PatternSummary, PatternCluster } from "../types/patterns.js";
import { CorePattern } from "../types/patterns.js";

/**
 * Compute the raw BPM from the beatmap's timing points.
 * Returns the beatLength of the first uninherited timing point,
 * or a default of 500ms (120 BPM) if none found.
 */
function rawBPM(beatmap: ParsedBeatmap): number {
  const tps = beatmap.timingPoints;
  if (tps.length === 0) return 120;

  let activeBeatLength = 500;
  for (const tp of tps) {
    if (tp.uninherited) {
      activeBeatLength = tp.beatLength;
      break;
    }
  }
  if (activeBeatLength <= 0) return 120;
  return 60000 / activeBeatLength;
}

/**
 * Determine the dominant pattern type from the most important cluster.
 */
function dominantPatternType(patterns: PatternSummary): string {
  if (!patterns.clusters.length) return "Stream";

  let top: PatternCluster = patterns.clusters[0]!;
  for (const c of patterns.clusters) {
    if (c.importance > top.importance) top = c;
  }
  return top.pattern;
}

/**
 * Get the dominant note division from the top cluster.
 * Falls back to 4 (1/4 = standard 16th) if no clusters.
 */
function dominantDivision(patterns: PatternSummary): number {
  if (!patterns.clusters.length) return 4;

  let top: PatternCluster = patterns.clusters[0]!;
  for (const c of patterns.clusters) {
    if (c.importance > top.importance) top = c;
  }
  return top.division || 4;
}

/**
 * Compute the equivalent BPM for a beatmap.
 *
 * Adjusts raw BPM based on the dominant pattern type and note division:
 * - Jack-dominant, division <= 2 (half notes): halve BPM
 *   (jacks at half speed = same physical effort as streams at 1/4)
 * - Stream-dominant, division >= 4 (quarter/16th): halve BPM
 *   (single streams are half the density of chord/jumpstreams)
 * - All others: keep raw BPM.
 *
 * The dominant division now comes directly from the beat-grid-aware
 * clustering, so no separate primitive re-analysis is needed.
 */
export function computeEquivalentBPM(beatmap: ParsedBeatmap, patterns: PatternSummary, speedRate = 1) {
  const raw = rawBPM(beatmap);
  const div = dominantDivision(patterns);
  const patternType = dominantPatternType(patterns);

  let adjustedBPM = raw;

  if (patternType === CorePattern.Jacks) {
    if (div <= 2) {
      adjustedBPM = raw / 2;
    }
  } else if (patternType === CorePattern.Stream) {
    if (div >= 4) {
      adjustedBPM = raw / 2;
    }
  }

  return {
    rawBPM: Math.round(raw * 100) / 100,
    adjustedBPM: Math.round(adjustedBPM * 100) / 100,
    dominantDivision: div,
    patternType,
  };
}






