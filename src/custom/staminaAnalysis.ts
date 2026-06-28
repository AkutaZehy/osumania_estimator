// ============================================================
// Stamina Analysis — 4-row density time series with stretch
// detection for max and median density levels.
// ============================================================

import type { StaminaMetrics } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import { createChart } from "../parser/chartBuilder.js";
import { calculatePrimitives } from "../patterns/primitives.js";
import type { PrimitiveRow } from "../types/primitives.js";

// ---------------------------------------------------------------------------
// Density time series builder
// ---------------------------------------------------------------------------

/**
 * Build a density time series sampled at `stepMs` intervals.
 * At each sample time the density is the total note count in the 4-row
 * sliding window whose first row is at-or-after the sample time.
 *
 * Returns [t, density] pairs.
 */
function buildDensityTimeSeries(
  primitives: PrimitiveRow[],
  stepMs: number,
): Array<[number, number]> {
  if (primitives.length === 0) return [];

  const startTime = primitives[0]!.time;
  const endTime = primitives[primitives.length - 1]!.time;
  const series: Array<[number, number]> = [];

  for (let t = startTime; t <= endTime; t += stepMs) {
    // Find the first primitive row at-or-after time t.
    let idx = 0;
    for (let i = 0; i < primitives.length; i++) {
      if (primitives[i]!.time >= t) {
        idx = i;
        break;
      }
    }

    // 4-row density starting at idx.
    let density = 0;
    const end = Math.min(idx + 4, primitives.length);
    for (let j = idx; j < end; j++) {
      density += primitives[j]!.rawNotes.length;
    }

    series.push([t, density]);
  }

  return series;
}

// ---------------------------------------------------------------------------
// Stretch detection
// ---------------------------------------------------------------------------

/**
 * From a density time series, find:
 *  - maxDensity: the highest density value observed
 *  - maxDuration: longest continuous stretch (ms) at exactly that value
 *  - medDensity: median density value
 *  - medDuration: longest continuous stretch (ms) at exactly the median
 *  - medTotalTime: total time (ms) spent at-or-above the median
 */
function analyzeDensitySeries(
  series: Array<[number, number]>,
  stepMs: number,
): StaminaMetrics {
  if (series.length === 0) {
    return {
      maxDensity: 0, maxDuration: 0,
      medDensity: 0, medDuration: 0,
      medTotalTime: 0, stretchRatio: 0, switchFrequency: 0,
    };
  }

  // Extract sorted densities for percentile calculation
  const densities = series.map(([, d]) => d).sort((a, b) => a - b);
  const n = densities.length;

  // Percentile helper
  const pctl = (p: number) => densities[Math.min(n - 1, Math.floor(n * p))]!;

  // P95 = "max" (top 5%), P50 = "med" (typical)
  const maxDensity = pctl(0.95);
  const medDensity = pctl(0.50);

  // Main difficulty range: P75-P95 average
  const p75 = pctl(0.75);
  const p95 = pctl(0.95);
  const mainCount = densities.filter((d) => d >= p75 && d <= p95).length;
  const mainSum = densities.filter((d) => d >= p75 && d <= p95).reduce((s, d) => s + d, 0);
  const mainAvg = mainCount > 0 ? mainSum / mainCount : maxDensity;

  // Secondary difficulty range: P50-P75 average
  const p50 = pctl(0.50);
  const secCount = densities.filter((d) => d >= p50 && d < p75).length;
  const secSum = densities.filter((d) => d >= p50 && d < p75).reduce((s, d) => s + d, 0);
  const secAvg = secCount > 0 ? secSum / secCount : medDensity;

  // Stretch detection: track consecutive samples at target values.
  // Stretch detection: continuous time above threshold (not exact match)
  function stretchAbove(threshold: number): number {
    let longest = 0;
    let current = 0;
    for (const [, d] of series) {
      if (d >= threshold) {
        current += stepMs;
        if (current > longest) longest = current;
      } else {
        current = 0;
      }
    }
    return longest;
  }

  // Total time ≥ P50 threshold.
  let medTotalTime = 0;
  for (const [, d] of series) {
    if (d >= medDensity) medTotalTime += stepMs;
  }

  return {
    maxDensity: Math.round(mainAvg * 10) / 10,
    maxDuration: stretchAbove(p75),    // stretch in P75-P95 range
    medDensity: Math.round(secAvg * 10) / 10,
    medDuration: stretchAbove(p50),    // stretch in P50+ range
    medTotalTime,
    stretchRatio: 0,
    switchFrequency: 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute stamina metrics using a 4-row density time series.
 *
 * Samples at 500ms intervals across the chart, computing 4-row note density
 * at each sample point.  Then derives max/median density values along with
 * stretch durations and total time above median.
 *
 * @param beatmap  - Parsed beatmap data.
 * @param _density - Pre-computed density metrics (unused in new implementation).
 * @returns StaminaMetrics with maxDensity, maxDuration, medDensity,
 *          medDuration, medTotalTime.
 */
export function computeStaminaMetrics(
  beatmap: ParsedBeatmap,
  _density: unknown,
): StaminaMetrics {
  if (beatmap.noteStarts.length === 0) {
    return {
      maxDensity: 0,
      maxDuration: 0,
      medDensity: 0,
      medDuration: 0,
      medTotalTime: 0, stretchRatio: 0, switchFrequency: 0,
    };
  }

  const chart = createChart(beatmap);
  const primitives = calculatePrimitives(chart);

  if (primitives.length === 0) {
    return {
      maxDensity: 0,
      maxDuration: 0,
      medDensity: 0,
      medDuration: 0,
      medTotalTime: 0, stretchRatio: 0, switchFrequency: 0,
    };
  }

  const stepMs = 500;
  const series = buildDensityTimeSeries(primitives, stepMs);
  const result = analyzeDensitySeries(series, stepMs);

  // Compute real stretchRatio and switchFrequency
  result.stretchRatio = beatmap.duration > 0 ? result.medTotalTime / beatmap.duration : 0;
  result.switchFrequency = computeSwitchFrequency(primitives);

  return result;
}

/**
 * Count max jack↔stream transitions in any 16-row window.
 */
function computeSwitchFrequency(primitives: PrimitiveRow[]): number {
  if (primitives.length < 16) return 0;

  let maxSwitches = 0;
  for (let i = 0; i <= primitives.length - 16; i++) {
    let switches = 0;
    let prevType: "jack" | "stream" | null = null;
    for (let j = i; j < i + 16; j++) {
      const row = primitives[j]!;
      const type: "jack" | "stream" = row.jacks > 0 ? "jack" : "stream";
      if (prevType !== null && type !== prevType) switches++;
      prevType = type;
    }
    if (switches > maxSwitches) maxSwitches = switches;
  }
  return maxSwitches;
}


