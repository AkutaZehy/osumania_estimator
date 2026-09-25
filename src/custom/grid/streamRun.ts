// ============================================================
// Grid Analysis — stream run analysis
// (replaces per-segment grid for stream cells)
// ============================================================

import type { ParsedBeatmap } from "../../types/beatmap.js";
import type { CellResult } from "./types.js";
import { getActiveBPM } from "./timing.js";
import { classifyStreamDensity, streamRunGrade } from "./keyType.js";

export interface StreamRun {
  cells: CellResult[];
  avgBPM: number;
  /** Per-cell sliding-window grid results: [gridTotalNotes, maxBeat][] */
  gridResults: Array<{ notes: number; maxBeat: number }>;
  histogram: Map<number, number>; // gridTotalNotes → cellCount
  totalStreamCells: number;
}

/**
 * Collect contiguous stream cells into runs, compute sliding-window
 * densliding-window density for each cell position.
 */
export function analyzeStreamRuns(
  cells: CellResult[],
  _beatmap: ParsedBeatmap,
): StreamRun[] {
  const runs: StreamRun[] = [];
  let i = 0;
  while (i < cells.length) {
    if (cells[i]!.category !== "stream") { i++; continue; }

    // Sliding-window helper: compute per-row note counts from pre-cached cell._notes.
    // Only counts notes within the 4-row window [cellStart, cellStart + 4*rd)
    // to match the original getNotesInRange-per-row-window behavior.
    const cellGrid = (cell: CellResult): { notes: number; maxBeat: number } => {
      const bpm = cell.effectiveBPM > 0 ? cell.effectiveBPM : 120;
      const rd = 60000 / bpm / 4;
      const rowEnd = cell.startTime + 4 * rd;
      const rn = [0, 0, 0, 0];
      for (const n of cell._notes) {
        if (n.start >= rowEnd) break; // past the 4-row window (notes are sorted)
        const relTime = n.start - cell.startTime;
        const r = Math.min(3, Math.max(0, Math.floor(relTime / rd)));
        rn[r]!++;
      }
      return { notes: rn.reduce((a, b) => a + b, 0), maxBeat: Math.max(...rn, 1) };
    };

    const runCells: CellResult[] = [];
    const gridResults: Array<{ notes: number; maxBeat: number }> = [];
    // Track recent density changes: require 2+ consecutive differing cells
    // before splitting, to avoid micro-runs from single-cell fluctuations.
    let divergeCount = 0;

    while (i < cells.length && cells[i]!.category === "stream") {
      const cell = cells[i]!;
      const gr = cellGrid(cell);

      if (gridResults.length > 0) {
        const prev = gridResults[gridResults.length - 1]!.notes;
        if (Math.abs(gr.notes - prev) >= 1) {
          divergeCount++;
          if (divergeCount >= 2 && runCells.length >= 4) {
            break; // sustained density change → split
          }
        } else {
          divergeCount = 0; // reset on similar density
        }
      }

      runCells.push(cell);
      gridResults.push(gr);
      i++;
    }
    if (runCells.length === 0) continue;

    // Average BPM of the run
    const bpmSum = runCells.filter(c => c.effectiveBPM > 0).map(c => c.effectiveBPM);
    const avgBPM = bpmSum.length > 0
      ? Math.round(bpmSum.reduce((a, b) => a + b, 0) / bpmSum.length)
      : 120;

    // Build histogram: count cells by gridTotalNotes
    const histo = new Map<number, number>();
    for (const g of gridResults) {
      histo.set(g.notes, (histo.get(g.notes) ?? 0) + 1);
    }

    runs.push({
      cells: runCells,
      avgBPM,
      gridResults,
      histogram: histo,
      totalStreamCells: runCells.length,
    });
  }
  return runs;
}

/**
 * Decompose a stream run using its RUN-LEVEL mean density.
 * Each run produces ONE entry with the key type determined by the
 * continuous average density across the entire run (not per-cell).
 * This avoids the SS vs Low JS tie issue and properly captures
 * Mid JS / High Stream at mixed-density boundaries.
 */
export function decomposeStreamRun(
  run: StreamRun,
  beatmap: ParsedBeatmap,
): Array<{ keyType: string; bpm: number; cellCount: number; grade: string }> {
  if (run.cells.length === 0) return [];

  // Use MEDIAN density for classification (not mean, not P75).
  // Mean is pulled down by filler sections; P75 is pulled up by dense tails.
  // Median captures the "typical" cell density in the run.
  const notesVals = run.gridResults.map((r) => r.notes).sort((a, b) => a - b);
  const medNotes = notesVals[Math.floor(notesVals.length / 2)]!;

  // Use MEDIAN maxBeat for HS detection (avoid single-cell pull)
  const maxBeats = run.gridResults.map((r) => r.maxBeat).sort((a, b) => a - b);
  const medianMaxBeat = maxBeats[Math.floor(maxBeats.length / 2)]!;

  // Classify using MEDIAN density
  const kt = classifyStreamDensity(medNotes, medianMaxBeat);

  // Compute BPM for display. For cells with a detected subdivision, use
  // effectiveBPM (includes speed multiplier). For grace cells (null subdivision),
  // the effectiveBPM = rawBPM but the actual note density may be much lower.
  // Adjust grace cell BPM proportionally: rawBPM × (noteCount / 4).
  // A normal 16th-note cell has noteCount=4 → no adjustment.
  // A sparse cell with noteCount=2 (quarter chord) → BPM halved.
  const bpmCounts = new Map<number, number>();
  for (const cell of run.cells) {
    let bpm = cell.effectiveBPM;
    // Grace cells (no detected subdivision) are rhythmically irregular/sparse.
    // Halve their BPM for display: the actual playing density is much lower
    // than the raw BPM suggests (e.g. quarter notes at 276 BPM feel like 138).
    if (bpm > 0 && cell.isGrace) bpm = bpm / 2;
    if (bpm <= 0) bpm = getActiveBPM(beatmap, cell.startTime);
    const b = Math.round(bpm);
    bpmCounts.set(b, (bpmCounts.get(b) ?? 0) + 1);
  }
  let modeBPM = 0, maxCnt = 0;
  for (const [b, c] of bpmCounts) { if (c > maxCnt) { maxCnt = c; modeBPM = b; } }

  return [{
    keyType: kt,
    bpm: modeBPM,
    cellCount: run.cells.length,
    grade: streamRunGrade(run.gridResults),
  }];
}
