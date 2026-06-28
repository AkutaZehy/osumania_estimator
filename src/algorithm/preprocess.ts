// ============================================================
// Preprocessing — beatmap to algorithm-friendly data structures
// Ported from osumania_map_analyser sunnyAlgorithm.js
// lines 196-325 (preprocessFile)
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { ModFlags } from "../types/algorithm.js";
import type { OsuFileParser } from "../parser/osuFileParser.js";

// ------------------------------------------------------------
// Result interface
// ------------------------------------------------------------

export interface PreprocessResult {
  /** Parsing status */
  status: "OK" | "Fail" | "NotMania";
  /** Hit leniency (derived from OD) */
  x: number;
  /** Key/column count */
  K: number;
  /** Total time span (max(maxHead, maxTail) + 1) */
  T: number;
  /** Flat note sequence: [column, head_time, tail_time] — tail = -1 for singles */
  noteSeq: Array<[number, number, number]>;
  /** Notes grouped by column */
  noteSeqByColumn: Array<Array<[number, number, number]>>;
  /** LN-only notes (endTime >= 0) */
  lnSeq: Array<[number, number, number]>;
  /** LN notes sorted by endTime */
  tailSeq: Array<[number, number, number]>;
  /** LN notes grouped by column */
  lnSeqByColumn: Array<Array<[number, number, number]>>;
  /** LN ratio (0–1) */
  lnRatio: number;
  /** Column count (redundant with K, kept for compat) */
  columnCount: number;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function emptyResult(
  status: "Fail" | "NotMania",
  lnRatio: number,
  columnCount: number,
): PreprocessResult {
  return {
    status,
    x: 0,
    K: 0,
    T: 0,
    noteSeq: [],
    noteSeqByColumn: [],
    lnSeq: [],
    tailSeq: [],
    lnSeqByColumn: [],
    lnRatio,
    columnCount,
  };
}

// ------------------------------------------------------------
// preprocessFile
// ------------------------------------------------------------

/**
 * Preprocess a parsed beatmap into algorithm-ready data structures.
 *
 * Applies speed rate scaling, OD adjustments (HR/EZ), and optional
 * mods (IN=inverse, HO=hold-off) via the parser object.
 *
 * @param beatmap - Parsed beatmap data
 * @param speedRate - Playback speed multiplier (e.g. 1.5 for DT, 0.75 for HT)
 * @param modFlags - Mod flag set
 * @param parser - Optional parser instance (required for modIN/modHO)
 */
export function preprocessFile(
  beatmap: ParsedBeatmap,
  speedRate: number,
  modFlags: ModFlags,
  parser?: OsuFileParser,
): PreprocessResult {
  let p = beatmap;
  let lnRatio: number;

  // Apply modIN / modHO if parser is available and flags are set
  if (parser) {
    if (modFlags.in) {
      try {
        parser.modIN();
        lnRatio = parser.getLNRatio();
      } catch {
        lnRatio = beatmap.lnRatio;
      }
    }
    if (modFlags.ho) {
      try {
        parser.modHO();
        lnRatio = parser.getLNRatio();
      } catch {
        lnRatio = beatmap.lnRatio;
      }
    }

    // Refresh side-data and re-fetch parsed result (always, matching JS ref)
    parser.getNoteTimes();
    parser.getObjectIntervals();
    p = parser.getParsedData();
    lnRatio = parser.getLNRatio();
  } else {
    lnRatio = beatmap.lnRatio;
  }

  // Status checks (matching JS p.status branches)
  if (p.gameMode !== 3) {
    return emptyResult("NotMania", lnRatio, p.columnCount);
  }
  if (p.columns.length === 0) {
    return emptyResult("Fail", lnRatio, p.columnCount);
  }

  // --------------------------------------------------------
  // OD adjustments (HR / EZ)
  // --------------------------------------------------------
  let od = p.od;
  if (modFlags.hr) {
    od = 6.462 + 0.715 * od;
  } else if (modFlags.ez) {
    od = -20.761 + 2.566 * od;
  }

  // --------------------------------------------------------
  // Speed rate → time scale
  // DT: speedRate=1.5 → timeScale=2/3, HT: speedRate=0.75 → timeScale=4/3
  // --------------------------------------------------------
  const timeScale = speedRate !== 0 ? 1 / speedRate : 1;

  // --------------------------------------------------------
  // Build note sequence [col, head, tail]
  // tail = endTime for LNs, -1 for singles
  // Apply timeScale to match playback timing
  // --------------------------------------------------------
  const noteSeq: Array<[number, number, number]> = [];
  for (let i = 0; i < p.columns.length; i++) {
    const k = p.columns[i]!;
    let h = p.noteStarts[i]!;
    let t = (p.noteTypes[i]! & 128) !== 0 ? p.noteEnds[i]! : -1;

    h = Math.floor(h * timeScale);
    t = t >= 0 ? Math.floor(t * timeScale) : t;

    noteSeq.push([k, h, t]);
  }

  // --------------------------------------------------------
  // Hit leniency (derived from OD)
  // --------------------------------------------------------
  let x = 0.3 * Math.sqrt((64.5 - Math.ceil(od * 3)) / 500);
  x = Math.min(x, 0.6 * (x - 0.09) + 0.09);

  // --------------------------------------------------------
  // Sort noteSeq by head time, then by column
  // --------------------------------------------------------
  noteSeq.sort((a, b) => {
    if (a[1] !== b[1]) return a[1]! - b[1]!;
    return a[0]! - b[0]!;
  });

  // --------------------------------------------------------
  // Grouped sequences
  // --------------------------------------------------------
  const K = p.columnCount;

  const noteSeqByColumn: Array<Array<[number, number, number]>> = Array.from(
    { length: K },
    () => [],
  );
  for (const n of noteSeq) {
    const col = n[0];
    if (col >= 0 && col < K) noteSeqByColumn[col]!.push(n);
  }

  const lnSeq = noteSeq.filter((n) => n[2] >= 0);
  const tailSeq = [...lnSeq].sort((a, b) => a[2]! - b[2]!);

  const lnSeqByColumn: Array<Array<[number, number, number]>> = Array.from(
    { length: K },
    () => [],
  );
  for (const n of lnSeq) {
    const col = n[0];
    if (col >= 0 && col < K) lnSeqByColumn[col]!.push(n);
  }

  // --------------------------------------------------------
  // Total time T = max(maxHead, maxTail) + 1
  // --------------------------------------------------------
  let maxHead = 0;
  let maxTail = 0;
  if (noteSeq.length > 0) {
    for (const n of noteSeq) {
      if (n[1] > maxHead) maxHead = n[1];
      if (n[2] > maxTail) maxTail = n[2];
    }
  }
  const T = Math.max(maxHead, maxTail) + 1;

  return {
    status: "OK",
    x,
    K,
    T,
    noteSeq,
    noteSeqByColumn,
    lnSeq,
    tailSeq,
    lnSeqByColumn,
    lnRatio,
    columnCount: K,
  };
}
