// ============================================================
// sunnyRework.ts — Main entry point for Sunny Rework algorithm
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 874-1004
// ============================================================

import { OsuFileParser } from "../parser/osuFileParser.js";
import { preprocessFile } from "./preprocess.js";
import { calculate } from "./aggregation.js";
import type { PreprocessResult } from "./preprocess.js";
import type { SunnyResult, ModFlags } from "../types/algorithm.js";

/**
 * Calculate Sunny Rework star rating for an osu!mania beatmap.
 *
 * Full pipeline:
 * 1. Parse .osu file content
 * 2. Apply mods (IN=inverse, HO=hold-off, HR/EZ OD adjustments)
 * 3. Preprocess into algorithm-ready data structures
 * 4. Compute corner arrays, key usage, anchor
 * 5. Compute all six bar components (Jbar, Xbar, Pbar, Abar, Rbar, C/Ks)
 * 6. Aggregate into D_all, compute weighted percentiles, derive SR
 * 7. Optionally generate difficulty graph
 *
 * @param osuText - Raw .osu file content as string
 * @param speedRate - Playback speed multiplier (1.0 = normal, 1.5 = DT, 0.75 = HT)
 * @param modFlags - Mod flag set (dt, ht, hr, ez, da, in, ho)
 * @param options - Optional: withGraph to generate difficulty curve
 * @returns SunnyResult with star rating, bars data, and optional graph
 */
export function calculateSunny(
  osuText: string,
  speedRate: number,
  modFlags: ModFlags,
  options?: { withGraph?: boolean },
  signal?: AbortSignal,
): SunnyResult {
  // Handle cvtFlag compatibility — IN and HO mods
  let cvtFlag: string | null = null;
  if (modFlags.in) cvtFlag = (cvtFlag ?? "") + "IN";
  if (modFlags.ho) cvtFlag = (cvtFlag ?? "") + "HO";

  // Create parser and process
  const parser = new OsuFileParser(osuText);
  parser.process();

  // Apply mods to parser before preprocessing
  if (cvtFlag) {
    if (cvtFlag.includes("IN")) {
      try {
        parser.modIN();
      } catch {
        // keep original on convert error
      }
    }
    if (cvtFlag.includes("HO")) {
      try {
        parser.modHO();
      } catch {
        // keep original on convert error
      }
    }
    // Refresh side-data after mods (matching JS ref lines 221-224)
    parser.getNoteTimes();
    parser.getObjectIntervals();
  }

  signal?.throwIfAborted();

  // preprocessFile handles HR/EZ internally via modFlags, and IN/HO via the parser
  const preprocessed: PreprocessResult = preprocessFile(
    parser.getParsedData(),
    speedRate,
    modFlags,
    parser,
  );
  signal?.throwIfAborted();

  if (preprocessed.status === "Fail" || preprocessed.status === "NotMania") {
    return {
      star: preprocessed.status === "Fail" ? -1 : -2,
      numericDifficulty: preprocessed.status === "Fail" ? -1 : -2,
      lnRatio: preprocessed.lnRatio,
      columnCount: preprocessed.columnCount,
      graph: { times: [], values: [] },
      bars: [],
      hitLeniency: 0,
    };
  }

  if (!preprocessed.noteSeq.length || preprocessed.K <= 0) {
    return {
      star: -1,
      numericDifficulty: -1,
      lnRatio: preprocessed.lnRatio,
      columnCount: preprocessed.columnCount,
      graph: { times: [], values: [] },
      bars: [],
      hitLeniency: 0,
    };
  }

  const withGraph = options?.withGraph === true;

  return calculate(
    preprocessed.x,
    preprocessed.K,
    preprocessed.noteSeq,
    preprocessed.noteSeqByColumn,
    preprocessed.lnSeq,
    preprocessed.tailSeq,
    preprocessed.lnRatio,
    preprocessed.columnCount,
    withGraph,
  );
}
