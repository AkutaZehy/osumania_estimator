// ============================================================
// Result Types — final output from the analysis pipeline
// ============================================================

import type { PatternSummary } from "./patterns.js";
import type { CustomMetrics } from "./custom.js";
import type { SunnyResult, DifficultyGraph } from "./algorithm.js";
import type { SectionAnalysis } from "../custom/sectionAnalysis.js";
import type { GridAnalysisResult } from "../custom/gridAnalysis.js";

/** Complete analysis result for a beatmap */
export interface DifficultyResult {
  /** Final blended star rating */
  finalStar: number;
  /** Sunny Rework component */
  sunny: SunnyResult;
  /** Pattern analysis component */
  patterns: PatternSummary;
  /** Custom metrics component */
  custom: CustomMetrics;
  /** Combined difficulty graph for UI rendering */
  graph: DifficultyGraph;
  /** Section analysis (per-measure + per-segment pattern breakdown) */
  sectionAnalysis: SectionAnalysis | null;
  /** Grid-based cell analysis (new key type system) */
  gridAnalysis: GridAnalysisResult | null;
  /** Beatmap metadata for display */
  meta: {
    title: string;
    artist: string;
    version: string;
    creator: string;
    columnCount: number;
    lnRatio: number;
    bpm: number;
  };
}

/** Options for the analysis pipeline */
export interface AnalysisOptions {
  /** Speed rate multiplier (1.0 = normal, 1.5 = DT, 0.75 = HT) */
  speedRate: number;
  /** Mod flags */
  modFlags: {
    dt: boolean;
    ht: boolean;
    hr: boolean;
    ez: boolean;
    da: boolean;
    in: boolean;
    ho: boolean;
  };
  /** Density window size in ms (default: 1000) */
  densityWindowMs: number;
}
