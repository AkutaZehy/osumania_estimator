// ============================================================
// Custom Metrics Orchestrator — wires all sub-modules together
// and produces a complete CustomMetrics result.
// ============================================================

import type { CustomMetrics } from "../types/custom.js";
import type { ParsedBeatmap } from "../types/beatmap.js";
import type { SunnyResult } from "../types/algorithm.js";
import type { PatternSummary } from "../types/patterns.js";
import type { GridAnalysisResult } from "./gridAnalysis.js";
import type { PrimitiveRow } from "../types/primitives.js";
import { createChart } from "../parser/chartBuilder.js";
import { calculatePrimitives } from "../patterns/primitives.js";
import { computeDensityMetrics } from "./density.js";
import { computeEquivalentBPM } from "./equivalentBpm.js";
import { computeJackMetrics } from "./jackAnalysis.js";
import { computeStreamMetrics } from "./streamAnalysis.js";
import { computeTechMetrics } from "./techAnalysis.js";
import { computeStaminaMetrics } from "./staminaAnalysis.js";
import { computeLNMetrics } from "./lnAnalysis.js";
import { computeAnchorMetrics } from "./anchorAnalysis.js";

/**
 * Compute the full custom metrics pipeline for a 4K beatmap.
 *
 * Takes the three core analysis inputs:
 *   1. ParsedBeatmap — raw .osu data (notes, timing, columns)
 *   2. SunnyResult — Sunny Rework strain/debug output
 *   3. PatternSummary — pattern cluster/classification data
 *
 * Produces a complete CustomMetrics object with all six sub-metrics:
 *   density, equivalentBPM, jack, stream, tech, stamina, ln.
 *
 * All sub-modules handle empty beatmaps gracefully by returning zero/default values.
 *
 * @param parsed   - Parsed beatmap data.
 * @param sunny    - Sunny Rework algorithm result.
 * @param patterns - Pattern analysis summary.
 * @returns Complete CustomMetrics result.
 */
export function computeCustomMetrics(
  parsed: ParsedBeatmap,
  sunny: SunnyResult,
  patterns: PatternSummary,
  speedRate: number = 1,
  gridAnalysis?: GridAnalysisResult | null,
  sharedPrimitives?: PrimitiveRow[],
): CustomMetrics {
  // Density metrics (used by multiple sub-modules).
  const density = computeDensityMetrics(parsed, 1000, speedRate);

  // Chart + primitives: jack/stream/tech/stamina each built their own copy
  // (and tech built a second one inside its roll/trill stats) — 5 duplicate
  // passes over every note per map. Build once here and share. When the
  // analyzer already built them (whole-pipeline sharing) they are passed in.
  const primitives = sharedPrimitives ?? calculatePrimitives(createChart(parsed), speedRate);

  // Equivalent BPM based on pattern type and note division.
  const equivalentBPM = computeEquivalentBPM(parsed, patterns, speedRate);

  // Jack-specific analysis.
  const jack = computeJackMetrics(parsed, density, speedRate, primitives);

  // Stream-specific analysis.
  const stream = computeStreamMetrics(parsed, density, speedRate, primitives);

  // Tech-specific analysis (bursts, graces, rolls/trills).
  const tech = computeTechMetrics(parsed, patterns, speedRate, gridAnalysis ?? undefined, primitives);

  // Stamina analysis (stretches above median density).
  const stamina = computeStaminaMetrics(parsed, density, speedRate, primitives);

  // LN-specific analysis (ratio, release, patterns).
  const ln = computeLNMetrics(parsed, sunny, patterns, speedRate);

  // Anchor/stamina analysis (SF, SH, DH).
  let anchor;
  try {
    anchor = computeAnchorMetrics(parsed, gridAnalysis ?? null);
  } catch (err) {
    console.error("[AnchorMetrics] failed", err);
    anchor = {
      sf: { p100: 0, p90: 0, p50: 0, p90Count: 0, p50Count: 0 },
      sh: { p100: 0, p90: 0, p50: 0, p90Count: 0, p50Count: 0 },
      dh: { p100: 0, p90: 0, p50: 0, p90Count: 0, p50Count: 0 },
      isJackType: false,
      sfBPM: 0,
      shBPM: 0,
    };
  }

  return {
    density,
    equivalentBPM,
    jack,
    stream,
    tech,
    stamina,
    ln,
    anchor,
  };
}
