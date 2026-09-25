// ============================================================
// Grid Analysis — Cell-based key type classification
// Replaces Interlude sliding-window with 4×4 grid sampling.
//
// Flow:
//   1. Split map into cells (1 cell = 1 beat at raw BPM)
//   2. Per cell: detect subdivision, classify jack/stream/ln/break
//   3. Group consecutive same-type cells into segments
//   4. Per segment: 4×4 grid → density → grade → keyType
//   5. Merge key types by BPM ±10, compute percentages
//
// Implementation lives in grid/ (detect, keyType, lnCell, ouroboros,
// segments, streamRun, timing, types); this file is the orchestrating
// entry point and the public import surface.
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import { getNotesInRange } from "../utils/beatmapUtils.js";
import { analyzeVibro } from "./vibroAnalysis.js";
import type { BPMKeyType, CellCategory, CellResult, GridAnalysisResult, SegmentResult } from "./grid/types.js";
import { getActiveBPM, getActiveBeatLength, getFirstBPM, getFirstBeatLength } from "./grid/timing.js";
import { detectCrossCellJacks, detectJack, detectSubdivision, computeBeatStructure } from "./grid/detect.js";
import { classifyStreamDensity, selectMainKeyType, streamRunGrade, LN_TYPES } from "./grid/keyType.js";
import { buildSegments, mergeBPMKeyTypes } from "./grid/segments.js";
import { analyzeStreamRuns, decomposeStreamRun } from "./grid/streamRun.js";

// Public surface (types + shared grade bands) — external consumers
// (ui, integration, types/result) import from this module.
export type { BPMKeyType, CellCategory, CellResult, GridAnalysisResult, SegmentResult } from "./grid/types.js";
export { gradeJack, gradeStream, jackGradeBand, streamGradeBand, LN_TYPES } from "./grid/keyType.js";

/**
 * Run the full cell-based grid analysis on a parsed beatmap.
 */
export function analyzeGrid(
  beatmap: ParsedBeatmap,
  signal?: AbortSignal,
  speedRate: number = 1,
): GridAnalysisResult | null {
  // Grid layout uses the FIRST timing point's beat length.
  // Each cell then uses its own active timing point for BPM/beatLength.
  const firstBPM = getFirstBPM(beatmap);
  const firstBeatLength = getFirstBeatLength(beatmap);
  const duration = beatmap.duration;

  // Align cell grid to the first uninherited timing point.
  // In osu!, the first red line defines where beat 0 falls in the audio.
  // Starting cells from 0 (instead of the TP time) would misalign the grid
  // and may miss the last note by up to a beat.
  const firstTP = beatmap.timingPoints.find((tp) => tp.uninherited);
  const gridOffset = firstTP ? firstTP.time : beatmap.firstNote;

  // duration now spans from gridOffset (first TP) to the last note end,
  // so totalBeats directly covers the full note range.
  const totalBeats = Math.max(1, Math.ceil(duration / firstBeatLength));

  // Phase 1: Classify each beat cell + pre-cache notes by cell & row
  const cells: CellResult[] = [];

  // Global grace counter: track how many cells have possible 1/6, 1/8, 1/12 intervals
  // If a subdivision appears in >30% of cells, it's not grace
  const globalSubdivCounts = new Map<number, number>();
  let totalAnalyzableCells = 0;

  for (let beat = 0; beat < totalBeats; beat++) {
    // Check cancellation periodically (every 50 beats)
    if (beat % 50 === 0) signal?.throwIfAborted();
    const cellStart = gridOffset + beat * firstBeatLength;
    const cellEnd = cellStart + firstBeatLength;

    // Per-cell timing from the active timing point at this cell's start
    const cellRawBPM = getActiveBPM(beatmap, cellStart);
    const cellBeatLength = getActiveBeatLength(beatmap, cellStart);

    const notes = getNotesInRange(beatmap, cellStart, cellEnd);
    const noteCount = notes.length;
    let lnNotes = 0;
    for (const n of notes) if (n.isLN) lnNotes++;
    const lnRatio = noteCount > 0 ? lnNotes / noteCount : 0;

    // Pre-group notes by quarter-beat row for zero-cost access by later phases
    const rowDuration = 60000 / (cellRawBPM || 120) / 4;
    const rowNotes = [[], [], [], []] as CellResult["_rowNotes"];
    for (const n of notes) {
      const relTime = n.start - cellStart;
      const rowIdx = Math.min(3, Math.max(0, Math.floor(relTime / rowDuration)));
      rowNotes[rowIdx]!.push(n);
    }

    // Break: no notes or very sparse
    if (noteCount === 0) {
      cells.push({
        beatIndex: beat, startTime: cellStart, endTime: cellEnd,
        category: "break", subdivision: null, effectiveBPM: 0,
        noteCount: 0, lnRatio: 0, beatNotes: [0, 0, 0, 0],
        _notes: notes, _rowNotes: rowNotes,
      });
      continue;
    }

    // LN: ≥50% are LNs
    if (lnRatio >= 0.5) {
      cells.push({
        beatIndex: beat, startTime: cellStart, endTime: cellEnd,
        category: "ln", subdivision: null, effectiveBPM: cellRawBPM,
        noteCount, lnRatio, beatNotes: [0, 0, 0, 0],
        _notes: notes, _rowNotes: rowNotes,
      });
      continue;
    }

    // Rice: detect subdivision and jack/stream
    totalAnalyzableCells++;
    const subdiv = detectSubdivision(notes, cellBeatLength);
    const effectiveBPM = subdiv ? cellRawBPM * (subdiv.denom / 4) : cellRawBPM;
    const subdivDenom = subdiv?.denom ?? 4;

    // Count global subdivision hints
    if (subdiv) {
      globalSubdivCounts.set(subdiv.denom, (globalSubdivCounts.get(subdiv.denom) ?? 0) + 1);
    }

    // Jack vs Stream
    const isJack = detectJack(notes, cellBeatLength, subdivDenom);
    const { structure } = computeBeatStructure(notes, cellStart, cellBeatLength);

    cells.push({
      beatIndex: beat, startTime: cellStart, endTime: cellEnd,
      category: isJack ? "jack" : "stream",
      subdivision: subdivDenom,
      isGrace: !subdiv, // true when detectSubdivision returned null
      effectiveBPM: Math.round(effectiveBPM),
      noteCount, lnRatio,
      beatNotes: structure,
      _notes: notes, _rowNotes: rowNotes,
    });
  }

  // Global grace correction: if a low subdivision appears in >30% of cells,
  // re-check grace cells — only reclassify those whose intervals genuinely match
  // the prevalent subdivision (not cells with truly irregular grace patterns).
  const graceThreshold = 0.30;
  for (const [denom, count] of globalSubdivCounts) {
    if (denom >= 6 && totalAnalyzableCells > 0 && count / totalAnalyzableCells >= graceThreshold) {
      for (const cell of cells) {
        if (cell.category === "break" || cell.category === "ln") continue;
        if (cell.subdivision !== null) continue;

        const notes = cell._notes;
        const cellBeatLength = getActiveBeatLength(beatmap, cell.startTime);
        const cellRawBPM = getActiveBPM(beatmap, cell.startTime);

        // Re-run detectSubdivision — only reclassify if this cell genuinely
        // matches the prevalent denom (grace cells with irregular intervals
        // should stay as grace).
        const subdiv = detectSubdivision(notes, cellBeatLength);
        if (!subdiv || subdiv.denom !== denom) continue;

        const isJack = detectJack(notes, cellBeatLength, denom);
        cell.subdivision = denom;
        cell.effectiveBPM = Math.round(cellRawBPM * (denom / 4));
        cell.category = isJack ? "jack" : "stream";
      }
    }
  }

  // Phase 1.5: Cross-cell jack detection
  // Fixes chordjack patterns where each column hits once per cell
  // but repeats at sub-beat intervals across cell boundaries.
  detectCrossCellJacks(cells, beatmap);

  // Phase 2: Build stream runs + non-stream segments
  // Stream cells use density-run analysis; jack/ln/break use segment grid.
  const streamRuns = analyzeStreamRuns(cells, beatmap);
  const nonStreamSegments = buildSegments(
    cells.filter((c) => c.category !== "stream"),
    beatmap,
  );

  // Convert stream runs to display segments (for structure grid / segment table)
  const streamSegments: SegmentResult[] = streamRuns.map((run) => {
    const first = run.cells[0]!, last = run.cells[run.cells.length - 1]!;
    const allNotes = run.gridResults.map((r) => r.notes);
    const allMax = run.gridResults.map((r) => r.maxBeat);
    const avgNotes = allNotes.reduce((a, b) => a + b, 0) / allNotes.length;
    const runGrade = streamRunGrade(run.gridResults);
    const runTypes = decomposeStreamRun(run, beatmap);
    return {
      cells: run.cells,
      category: "stream" as CellCategory,
      effectiveBPM: run.avgBPM,
      subdivision: 0,
      startTime: first.startTime,
      endTime: last.endTime,
      startBeat: first.beatIndex,
      endBeat: last.beatIndex,
      gridTotalNotes: avgNotes,
      avgPerRow: avgNotes / 4,
      maxBeat: Math.max(...allMax),
      grade: runGrade,
      keyType: runTypes[0]?.keyType ?? "Stream",
      rowNotes: [0, 0, 0, 0],
      jackDensity: 0,
      lnSubtype: null,
      lnSubtypes: [],
    };
  });

  // Combine all segments for display
  const segments = [...nonStreamSegments, ...streamSegments].sort(
    (a, b) => a.startTime - b.startTime,
  );

  // Phase 3: Merge key type entries from both sources
  // Non-stream segments → mergeBPMKeyTypes (existing logic)
  const segKeyTypes = mergeBPMKeyTypes(nonStreamSegments);

  // Stream runs → decomposed entries per run
  const runEntries = streamRuns.flatMap((r) => decomposeStreamRun(r, beatmap));

  // Combine: mergeBPMKeyTypes output + run entries → aggregated bpmKeyTypes
  const combinedEntries = new Map<string, { cellCount: number; bpm: number; keyType: string }>();
  for (const bkt of segKeyTypes) {
    const key = `${bkt.keyType}|${bkt.bpm}`;
    combinedEntries.set(key, { keyType: bkt.keyType, bpm: bkt.bpm, cellCount: bkt.cellCount });
  }
  for (const re of runEntries) {
    const key = `${re.keyType}|${re.bpm}`;
    const existing = combinedEntries.get(key);
    if (existing) {
      existing.cellCount += re.cellCount;
    } else {
      combinedEntries.set(key, { keyType: re.keyType, bpm: re.bpm, cellCount: re.cellCount });
    }
  }

  const totalCells = cells.filter((c) => c.category !== "break").length;
  const bpmKeyTypes: BPMKeyType[] = [...combinedEntries.values()]
    .map((e) => ({
      keyType: e.keyType,
      bpm: e.bpm,
      cellCount: e.cellCount,
      percentage: totalCells > 0 ? (e.cellCount / totalCells) * 100 : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // Phase 4: BPM-first + merge + N=50 main key type selection
  let mainKeyType = selectMainKeyType(bpmKeyTypes);
  // Recompute percentage for the winner (relative to total non-LN)
  const nonLNCells = bpmKeyTypes.filter(e => !LN_TYPES.has(e.keyType)).reduce((s, e) => s + e.cellCount, 0);
  if (nonLNCells > 0) mainKeyType.percentage = (mainKeyType.cellCount / nonLNCells) * 100;

  const effectiveBPMs = cells
    .filter((c) => c.effectiveBPM > 0 && c.category !== "break")
    .map((c) => c.effectiveBPM);
  const bpmRange = {
    min: effectiveBPMs.length > 0 ? Math.min(...effectiveBPMs) : firstBPM,
    max: effectiveBPMs.length > 0 ? Math.max(...effectiveBPMs) : firstBPM,
  };

  // Compute stream density breakdown for custom metrics display
  const typeCounts = new Map<string, number>();
  for (const run of streamRuns) {
    for (let ci = 0; ci < run.cells.length; ci++) {
      const gr = run.gridResults[ci]!;
      const kt = classifyStreamDensity(gr.notes, gr.maxBeat);
      typeCounts.set(kt, (typeCounts.get(kt) ?? 0) + 1);
    }
  }
  const totalSC = [...typeCounts.values()].reduce((a, b) => a + b, 0);
  const streamBreakdown = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([_, c]) => totalSC > 0 && c / totalSC >= 0.05)
    .map(([kt, c]) => `${kt} ${(c / totalSC * 100).toFixed(0)}%`)
    .join(" + ") || "Stream";

  // Grid-based switch: rows = actual note timestamps (uneven), NOT a fixed
  // grid. A jack pair = two consecutive time points sharing any column
  // (lenient: same-column repeats, whether single-column jacks or chord
  // overlaps — this captures frequent stable alternation like What Is Love).
  // Consecutive same-type pairs merge into runs; switch = run-type transitions
  // inside a sliding time window of 16 cells (16 beats). gridSwitch = max over
  // all window positions. High = frequent stable switching (rhythmic jacks);
  // low = sustained single-mode sections (pure stream/jumpstream).
  let gridSwitch = 0;
  {
    // Gather all rice notes (LN heads included as single notes at their start
    // time), cluster into uneven rows by actual timestamp.
    const rows: { t: number; cols: Set<number> }[] = [];
    for (const cell of cells) {
      if (cell.category === "break") continue;
      const cellNotes = cell._notes
        .filter((n) => n.start >= cell.startTime && n.start < cell.endTime)
        .sort((a, b) => a.start - b.start);
      for (const n of cellNotes) {
        const last = rows[rows.length - 1];
        if (last !== undefined && n.start - last.t <= 8) last.cols.add(n.col);
        else rows.push({ t: n.start, cols: new Set([n.col]) });
      }
    }
    if (rows.length < 2) {
      gridSwitch = 0;
    } else {
      // Pair each consecutive time point: shared column -> J, else S.
      const pairTypes: ("J" | "S")[] = [];
      const pairTimes: number[] = [];
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i]!.cols, b = rows[i + 1]!.cols;
        if (!a.size || !b.size) continue;
        pairTypes.push([...a].some((c) => b.has(c)) ? "J" : "S");
        pairTimes.push(rows[i + 1]!.t);
      }
      // Merge consecutive same-type pairs into runs.
      const runs: { t: "J" | "S"; s: number; e: number }[] = [];
      {
        let cur: "J" | "S" | null = null;
        let start = 0;
        const flush = (end: number) => { if (cur !== null) { runs.push({ t: cur, s: start, e: end }); cur = null; } };
        for (let i = 0; i <= pairTypes.length; i++) {
          const p = i < pairTypes.length ? pairTypes[i]! : null;
          if (p === null) { flush(i - 1); continue; }
          if (cur === null) { cur = p; start = i; continue; }
          if (p !== cur) { flush(i - 1); cur = p; start = i; }
        }
        flush(pairTypes.length - 1);
      }
      // Sliding time window of 16 cells = 16 beats.
      const beatLength = getFirstBeatLength(beatmap);
      const winMs = 16 * beatLength;
      const lb = (arr: number[], x: number) => {
        let lo = 0, hi = arr.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid]! < x) lo = mid + 1; else hi = mid; }
        return lo;
      };
      const lastT = pairTimes[pairTimes.length - 1]!;
      for (let t0 = rows[0]!.t; t0 <= lastT; t0 += beatLength) {
        const tEnd = t0 + winMs;
        const lo = lb(pairTimes, t0), hi = lb(pairTimes, tEnd);
        if (hi - lo < 2) continue;
        let prevT: "J" | "S" | null = null;
        let sw = 0;
        for (const r of runs) {
          if (r.e < lo || r.s >= hi) continue;
          if (prevT !== null && r.t !== prevT) sw++;
          prevT = r.t;
        }
        if (sw > gridSwitch) gridSwitch = sw;
      }
    }
  }

  // Vibro analysis. Labels report played-time seconds: analyzeVibro works on
  // raw note times, so burst/control durations divide by speedRate (the same
  // played-time convention as the JACK stamina readout).
  const notes = beatmap.columns.map((col, i) => ({ col, t: beatmap.noteStarts[i]! })).filter(n => n.t >= 0);
  const vibroResult = analyzeVibro(notes, firstBPM);
  let vibroLabel: string;
  if (vibroResult.verdict === "no_vibro") vibroLabel = "No Vibro";
  else if (vibroResult.verdict === "suspicious") vibroLabel = "Vibro Suspicious";
  else {
    const fmt = (ms: number) => (ms / speedRate / 1000).toFixed(1) + "s";
    vibroLabel = `Vibro(${vibroResult.displayCvRate ?? 0}%) B${fmt(vibroResult.burstMs)}/C${fmt(vibroResult.controlMs)}`;
  }

  // Switch descriptor: high switch = frequent stable alternation (rhythmic
  // jacks), low = sustained single-mode sections. Steady = stable stream /
  // jumpstream with few transitions; Mixed = some switching inside streams;
  // Rhythmic = frequent, regular alternation; Intense = dense chordjack-style
  // switching.
  const gridSwitchLabel = gridSwitch <= 15 ? "Steady"
    : gridSwitch <= 25 ? "Mixed"
    : gridSwitch <= 35 ? "Rhythmic"
    : "Intense";

  // Apply speedRate to time-based fields only. Structure (category,
  // subdivision, noteCount, grades, gridSwitch, startTime/endTime) is
  // speed-independent and stays on the original map's grid.
  if (speedRate !== 1) {
    for (const cell of cells) {
      cell.effectiveBPM = Math.round(cell.effectiveBPM * speedRate);
    }
    for (const seg of segments) {
      seg.effectiveBPM = Math.round(seg.effectiveBPM * speedRate);
    }
    for (const kt of bpmKeyTypes) {
      kt.bpm = Math.round(kt.bpm * speedRate);
    }
    mainKeyType.bpm = Math.round(mainKeyType.bpm * speedRate);
    bpmRange.min = Math.round(bpmRange.min * speedRate);
    bpmRange.max = Math.round(bpmRange.max * speedRate);
  }

  return { cells, segments, bpmKeyTypes, mainKeyType, bpmRange, streamBreakdown, gridSwitch, gridSwitchLabel, vibroLabel };
}
