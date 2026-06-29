// ============================================================
// Pattern Summary — orchestrates the full pattern analysis pipeline
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { Chart } from "../types/chart.js";
import type { PatternSummary } from "../types/patterns.js";
import { createChart } from "../parser/chartBuilder.js";
import { calculatePrimitives } from "./primitives.js";
import { find } from "./findPatterns.js";
import { calculateClusteredPatterns } from "./clustering.js";

/**
 * Run full pattern analysis on a parsed beatmap.
 * Pipeline: parse → primitives → detect → cluster → categorize
 */
export function analyzePatterns(beatmap: ParsedBeatmap, speedRate: number = 1): PatternSummary {
  const chart: Chart = createChart(beatmap);
  const primitives = calculatePrimitives(chart, speedRate);
  const duration = chart.duration;

  // Detect patterns via sliding window
  const foundPatterns = find(primitives);

  // Extract primary beat length from first uninherited timing point
  let beatLength = 500;
  for (const tp of beatmap.timingPoints) {
    if (tp.uninherited) {
      beatLength = tp.beatLength;
      break;
    }
  }
  if (beatLength <= 0) beatLength = 500;

  // Compute LN ratio and HB row ratio for mode detection
  const lnRatio = beatmap.lnRatio;

  // Cluster patterns by beat-grid division
  const modeTag = resolveModeTag(lnRatio, 0);
  const clusters = calculateClusteredPatterns(foundPatterns, primitives, { beatLength, modeTag });

  // Filter: keep clusters with valid division (>= 0 for LN patterns)
  const filtered = clusters.filter((c) => c.division >= 0);

  // Sort by amount descending, prune duplicates
  filtered.sort((a, b) => b.amount - a.amount);

  // Keep 1 per (pattern × division) to preserve speed variants (e.g. 24th Stream vs 16th Stream)
  const kept: typeof filtered = [];
  const seen = new Set<string>();
  for (const c of filtered) {
    const key = `${c.pattern}@@${c.division}`;
    if (!seen.has(key)) {
      kept.push(c);
      seen.add(key);
    }
  }

  // Re-sort by importance descending
  kept.sort((a, b) => b.importance - a.importance);

  // Category from dominant cluster
  const category = kept.length > 0 ? classifyChart(kept) : "Unknown";

  // SV detection
  const svAmount = 0; // placeholder — not critical for 4K

  return {
    clusters: kept,
    category,
    lnPercent: lnRatio * 100,
    modeTag,
    svAmount,
    duration,
    importantClusters: kept,
    // Pass raw LN pattern counts for accurate display
    _lnCounts: {
      shields: foundPatterns.filter((p) => p.specificType === "Shield").length,
      antiShields: 0, // counted from parsed data in lnAnalysis
      columnLocks: foundPatterns.filter((p) => p.specificType === "ColumnLock").length,
      inverses: foundPatterns.filter((p) => p.specificType === "Inverse").length,
      releases: foundPatterns.filter((p) => p.specificType === "Release").length,
    },
  };
}

function resolveModeTag(lnRatio: number, hbRowRatio: number): PatternSummary["modeTag"] {
  if (lnRatio <= 0.15) return "RC";
  if (lnRatio >= 0.9) return "LN";
  if (hbRowRatio >= 0.1) return "HB";
  return "Mix";
}

function classifyChart(clusters: PatternSummary["clusters"]): string {
  const top = clusters[0]!;
  const specific = top.specificTypes[0];
  if (specific && specific[0] && specific[1] > 0.05) {
    return specific[0];
  }
  return top.pattern;
}
