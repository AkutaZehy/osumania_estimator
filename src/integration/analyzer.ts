// ============================================================
// analyzer.ts — Main analysis pipeline for osumania-estimator
// ============================================================
// Pipeline: parse → createChart → calculateSunny →
//   pattern summary → computeCustomMetrics → aggregateDifficulty → result
// ============================================================

import type { DifficultyResult, AnalysisOptions } from "../types/result.js";
import type { SunnyResult, ModFlags, DifficultyGraph } from "../types/algorithm.js";
import type { CustomMetrics } from "../types/custom.js";
import type { PatternSummary } from "../types/patterns.js";
import type { ParsedBeatmap } from "../types/beatmap.js";

import { OsuFileParser } from "../parser/osuFileParser.js";
import { calculateSunny } from "../algorithm/sunnyRework.js";
import { analyzePatterns } from "../patterns/summary.js";
import { computeDensityMetrics } from "../custom/density.js";
import { computeCustomMetrics } from "../custom/customMetrics.js";
import { aggregateDifficulty } from "./difficultyAggregator.js";

// ---- Defaults for optional / placeholder subsystems ----

const DEFAULT_MOD_FLAGS: ModFlags = {
  dt: false,
  ht: false,
  hr: false,
  ez: false,
  da: false,
  in: false,
  ho: false,
};

const DEFAULT_OPTIONS: AnalysisOptions = {
  speedRate: 1.0,
  modFlags: DEFAULT_MOD_FLAGS,
  densityWindowMs: 1000,
};

function defaultPatternSummary(duration: number, lnRatio: number): PatternSummary {
  return {
    clusters: [],
    category: "Unknown",
    lnPercent: lnRatio * 100,
    modeTag: "Mix",
    svAmount: 0,
    duration,
    importantClusters: [],
  };
}

function defaultCustomMetrics(
  densityFromModule: ReturnType<typeof computeDensityMetrics>,
  lnRatio: number,
  bpm: number,
): CustomMetrics {
  return {
    density: densityFromModule,
    equivalentBPM: {
      rawBPM: bpm,
      adjustedBPM: bpm,
      dominantDivision: 4,
      patternType: "Stream",
    },
    jack: {
      densityGrade: null,
      anchorCount: 0,
      singleFingerPressure: 0,
      singleHandPressure: 0,
      imbalance4r: 0,
      imbalance16r: 0,
      imbalanceTotal: 0,
      isBias: false,
      isVibro: false,
    },
    stream: {
      streamType: null,
      densityGrade: null,
      imbalance4r: 0,
      imbalance16r: 0,
      imbalanceTotal: 0,
      brokenMax: 0,
      brokenMed: 0,
    },
    tech: {
      graceCount: 0,
      rollTrill: { rolls: "", trills: "" },
      burst: {
        singleFingerMaxKPS: 0,
        oneHandMaxKPS: 0,
        bothHandsMaxKPS: 0,
      },
    },
    stamina: {
      maxDensity: 0,
      maxDuration: 0,
      medDensity: 0,
      medDuration: 0,
      medTotalTime: 0,
      stretchRatio: 0,
      switchFrequency: 0,
    },
    ln: {
      ratio: lnRatio,
      releaseDifficulty: 0,
      shieldCount: 0,
      antiShieldCount: 0,
      columnLockCount: 0,
      inverseCount: 0,
      asyncReleaseCount: 0,
      releaseCount: 0,
      tapLNCount: 0,
      overlayCount: 0,
      totalLN: 0,
      strictLNRatio: 0,
    },
  };
}

function computeBPM(beatmap: ParsedBeatmap): number {
  const uninherited = beatmap.timingPoints.find((tp) => tp.uninherited);
  if (uninherited && uninherited.beatLength > 0) {
    return 60000 / uninherited.beatLength;
  }
  return 120;
}

function buildErrorResult(
  meta: DifficultyResult["meta"],
  _message: string,
): DifficultyResult {
  return {
    finalStar: -1,
    sunny: {
      star: -1,
      numericDifficulty: -1,
      lnRatio: 0,
      columnCount: meta.columnCount,
      graph: { times: [], values: [] },
      bars: [],
      hitLeniency: 0,
    },
    patterns: defaultPatternSummary(0, 0),
    custom: defaultCustomMetrics(
      {
        perColumn: [],
        perHand: {
          left: { maxDensity: 0, medianDensity: 0 },
          right: { maxDensity: 0, medianDensity: 0 },
        },
        bothHands: { maxDensity: 0, medianDensity: 0 },
      },
      0,
      0,
    ),
    graph: { times: [], values: [] },
    meta,
  };
}

// ---- Main entry point ----

/**
 * Analyze an osu!mania beatmap and return a full DifficultyResult.
 *
 * Full pipeline:
 * 1. Parse .osu text → ParsedBeatmap
 * 2. Create Chart intermediate representation
 * 3. Run Sunny Rework star rating algorithm
 * 4. Build pattern summary (placeholder; defaults used)
 * 5. Compute custom density metrics
 * 6. Aggregate Sunny + Custom into final star rating
 * 7. Build result with metadata and graph
 *
 * @param osuText  - Raw .osu file content as string.
 * @param options  - Partial AnalysisOptions (speedRate, modFlags, densityWindowMs).
 * @returns DifficultyResult with finalStar, components, graph, and meta.
 */
export function analyzeBeatmap(
  osuText: string,
  options?: Partial<AnalysisOptions>,
): DifficultyResult {
  // Merge options with defaults
  const opts: AnalysisOptions = { ...DEFAULT_OPTIONS, ...options };
  const modFlags: ModFlags = { ...DEFAULT_MOD_FLAGS, ...options?.modFlags };

  // ---- Step 1: Parse ----
  let beatmap: ParsedBeatmap;
  try {
    const parser = new OsuFileParser(osuText);
    parser.process();
    beatmap = parser.getParsedData();
  } catch {
    return buildErrorResult(
      {
        title: "",
        artist: "",
        version: "",
        creator: "",
        columnCount: 0,
        lnRatio: 0,
        bpm: 0,
      },
      "Parse failed",
    );
  }

  // ---- Step 2: Sunny Rework ----
  let sunny: SunnyResult;
  try {
    sunny = calculateSunny(osuText, opts.speedRate, modFlags, { withGraph: true });
  } catch {
    sunny = {
      star: -1,
      numericDifficulty: -1,
      lnRatio: beatmap.lnRatio,
      columnCount: beatmap.columnCount,
      graph: { times: [], values: [] },
      bars: [],
      hitLeniency: 0,
    };
  }

  // ---- Step 3: Pattern Analysis ----
  let patterns: PatternSummary;
  try {
    patterns = analyzePatterns(beatmap, opts.speedRate);
  } catch {
    patterns = defaultPatternSummary(beatmap.duration, beatmap.lnRatio);
  }

  // ---- Step 4: Custom Metrics ----
  let custom: CustomMetrics;
  try {
    custom = computeCustomMetrics(beatmap, sunny, patterns, opts.speedRate);
  } catch (err) {
    console.error("[CustomMetrics] failed", err);
    custom = defaultCustomMetrics(
      { perColumn: [], perHand: { left: { maxDensity: 0, medianDensity: 0 }, right: { maxDensity: 0, medianDensity: 0 } }, bothHands: { maxDensity: 0, medianDensity: 0 } },
      beatmap.lnRatio,
      computeBPM(beatmap),
    );
  }

  // ---- Step 5: Aggregate ----
  const { finalStar } = aggregateDifficulty(sunny, patterns, custom);

  // ---- Step 6: Build result ----
  const rawBpm = computeBPM(beatmap);
  const metaBpm = Math.round(rawBpm * opts.speedRate);

  // Use Sunny's graph if available, otherwise fall back
  const graph: DifficultyGraph =
    sunny.graph.times.length > 0
      ? sunny.graph
      : { times: [], values: [] };

  const result: DifficultyResult = {
    finalStar,
    sunny,
    patterns,
    custom,
    graph,
    meta: {
      title: beatmap.metadata.title,
      artist: beatmap.metadata.artist,
      version: beatmap.metadata.version,
      creator: beatmap.metadata.creator,
      columnCount: beatmap.columnCount,
      lnRatio: beatmap.lnRatio,
      bpm: metaBpm,
    },
  };

  return result;
}
