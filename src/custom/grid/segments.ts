// ============================================================
// Grid Analysis — 4×4 grid construction & segment builder
// ============================================================

import type { ParsedBeatmap } from "../../types/beatmap.js";
import type { BPMKeyType, CellResult, NoteInfo, SegmentResult } from "./types.js";
import { getFirstBPM, median } from "./timing.js";
import { classifyJack, classifyStream } from "./keyType.js";
import { analyzeLNCell, classifyLNCell } from "./lnCell.js";

// ---------------------------------------------------------------------------
// 4×4 Grid Construction
// ---------------------------------------------------------------------------

/**
 * Build a 4×4 grid for a segment.
 * 4 columns × 4 rows, where row spacing = 1/4 beat at effective BPM.
 *
 * For jack at 1/2: rowsPerCell = 4/2 = 2, so each grid row spans 2 original cells
 * For stream at 1/8: rowsPerCell = 4/8 = 0.5, so each grid row spans 0.5 original cells
 */
export function buildGrid(
  segmentCells: CellResult[],
  effectiveBPM: number,
  _subdivision: number,
  _beatmap: ParsedBeatmap,
): {
  gridNotes: number;
  maxBeat: number;
  avgPerRow: number;
  rowNotes: number[];
} {
  const jackInterval = 60000 / (effectiveBPM || 120) / 4;

  // Collect all notes across the segment from pre-cached cell._notes
  const allNotes: Array<{ time: number; col: number }> = [];
  for (const cell of segmentCells) {
    for (const n of cell._notes) allNotes.push({ time: n.start, col: n.col });
  }

  // Fallback: too few notes → use per-cell row method
  if (allNotes.length < 2) {
    return fallbackGrid(segmentCells, jackInterval);
  }

  // Note-clustering: group by jack interval around first note
  const anchor = allNotes[0]!.time;
  const clusters = new Map<number, number>();
  for (const n of allNotes) {
    const slot = Math.round((n.time - anchor) / jackInterval);
    clusters.set(slot, (clusters.get(slot) ?? 0) + 1);
  }

  const slots = [...clusters.entries()].sort((a, b) => a[0] - b[0]);
  if (slots.length === 0) {
    return { gridNotes: 0, maxBeat: 1, avgPerRow: 0, rowNotes: [0, 0, 0, 0] };
  }

  const minSlot = slots[0]![0];
  const maxSlot = slots[slots.length - 1]![0];

  // Not enough jack positions → fallback
  if (maxSlot - minSlot < 3) {
    return fallbackGrid(segmentCells, jackInterval);
  }

  // Slide 4-cluster window for max total
  let bestTotal = 0;
  let bestRowNotes: number[] = [0, 0, 0, 0];

  for (let w = minSlot; w <= maxSlot - 3; w++) {
    let sum = 0;
    const rv: number[] = [];
    for (let r = 0; r < 4; r++) {
      const v = clusters.get(w + r) ?? 0;
      rv.push(v);
      sum += v;
    }
    if (sum >= bestTotal) { bestTotal = sum; bestRowNotes = rv; }
  }

  return {
    gridNotes: bestTotal,
    maxBeat: Math.max(...bestRowNotes, 1),
    avgPerRow: bestTotal / 4,
    rowNotes: bestRowNotes,
  };
}

function fallbackGrid(
  cells: CellResult[],
  rowDuration: number,
): { gridNotes: number; maxBeat: number; avgPerRow: number; rowNotes: number[] } {
  let bestTotal = 0;
  let bestRowNotes: number[] = [0, 0, 0, 0];
  let bestMaxBeat = 1;
  for (const cell of cells) {
    const rowNotes: number[] = [0, 0, 0, 0];
    const rowEnd = cell.startTime + 4 * rowDuration;
    for (const n of cell._notes) {
      if (n.start >= rowEnd) break; // past the 4-row window
      const relTime = n.start - cell.startTime;
      const r = Math.min(3, Math.max(0, Math.floor(relTime / rowDuration)));
      rowNotes[r]!++;
    }
    const total = rowNotes.reduce((a, b) => a + b, 0);
    if (total > bestTotal) { bestTotal = total; bestRowNotes = rowNotes; bestMaxBeat = Math.max(...rowNotes, 1); }
  }
  return { gridNotes: bestTotal, maxBeat: bestMaxBeat, avgPerRow: bestTotal / 4, rowNotes: bestRowNotes };
}

// ---------------------------------------------------------------------------
// Segment Builder
// ---------------------------------------------------------------------------

/**
 * Group cells into contiguous segments of same category + similar BPM.
 */
export function buildSegments(
  cells: CellResult[],
  beatmap: ParsedBeatmap,
): SegmentResult[] {
  if (cells.length === 0) return [];

  const segments: SegmentResult[] = [];
  let segCells: CellResult[] = [cells[0]!];

  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1]!;
    const curr = cells[i]!;

    // Segment boundary: category changed, or BPM jump > 15
    const categoryChanged = curr.category !== prev.category;
    const bpmJump =
      prev.category !== "break" && curr.category !== "break" &&
      Math.abs(curr.effectiveBPM - prev.effectiveBPM) > 15;

    if (categoryChanged || bpmJump) {
      segments.push(createSegment(segCells, beatmap));
      segCells = [curr];
    } else {
      segCells.push(curr);
    }
  }

  // Final segment
  if (segCells.length > 0) {
    segments.push(createSegment(segCells, beatmap));
  }

  return segments;
}

/**
 * Compute segment-level jack density (purity): N→N+1 column sharing rate
 * among non-empty 16th-note positions within the segment.
 * Range 0-1. Pure jack ≈ 0.7-1.0, alternating minijack ≈ 0.3-0.5, stream ≈ <0.2.
 */
function computeSegmentDensity(
  cells: CellResult[],
  effectiveBPM: number,
  _beatmap: ParsedBeatmap,
): number {
  if (cells.length === 0) return 0;
  const subdiv = cells[0]!.subdivision ?? 4;
  const rawBPM = effectiveBPM > 0 && subdiv ? effectiveBPM / (subdiv / 4) : effectiveBPM || 120;
  const step16 = 60000 / rawBPM / 4;

  const allNotes: Array<{ time: number; col: number }> = [];
  for (const cell of cells) {
    for (const n of cell._notes) allNotes.push({ time: n.start, col: n.col });
  }
  if (allNotes.length < 2) return 0;

  const buckets = new Map<number, Set<number>>();
  const t0 = cells[0]!.startTime;
  for (const n of allNotes) {
    const idx = Math.floor((n.time - t0) / step16);
    if (!buckets.has(idx)) buckets.set(idx, new Set());
    buckets.get(idx)!.add(n.col);
  }

  const slots = [...buckets.entries()]
    .filter(([_, cols]) => cols.size > 0)
    .sort((a, b) => a[0] - b[0]);
  if (slots.length < 2) return 0;

  let sharedPairs = 0;
  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1]![1], curr = slots[i]![1];
    for (const c of curr) { if (prev.has(c)) { sharedPairs++; break; } }
  }
  return sharedPairs / (slots.length - 1);
}

export function createSegment(
  cells: CellResult[],
  beatmap: ParsedBeatmap,
): SegmentResult {
  const first = cells[0]!, last = cells[cells.length - 1]!;
  const category = first.category;

  // Get average effective BPM
  const bpmSum = cells
    .filter((c) => c.effectiveBPM > 0)
    .reduce((sum, c) => sum + c.effectiveBPM, 0);
  const bpmCount = cells.filter((c) => c.effectiveBPM > 0).length;
  const effectiveBPM = bpmCount > 0 ? Math.round(bpmSum / bpmCount) : getFirstBPM(beatmap);

  // Default subdivision
  const subdivs = cells
    .filter((c) => c.subdivision != null)
    .map((c) => c.subdivision!);
  const subdivision = subdivs.length > 0 ? Math.round(median(subdivs)) : 4;

  let gridTotalNotes = 0;
  let avgPerRow = 0;
  let maxBeat = 0;
  let grade = "";
  let keyType = "";
  let rowNotes: number[] = [0, 0, 0, 0];

  if (category === "jack" || category === "stream") {
    const grid = buildGrid(cells, effectiveBPM, subdivision, beatmap);
    gridTotalNotes = grid.gridNotes;
    avgPerRow = grid.avgPerRow;
    maxBeat = grid.maxBeat;
    rowNotes = grid.rowNotes;

    if (category === "jack") {
      const result = classifyJack(gridTotalNotes);
      keyType = result.keyType;
      grade = result.grade;
    } else {
      const result = classifyStream(gridTotalNotes, maxBeat, rowNotes);
      keyType = result.keyType;
      grade = result.grade;
    }
  }

  // LN segment
  let lnSubtype: string | null = null;
  let lnSubtypes: Array<{ key: string; name: string; value: string }> = [];
  if (category === "ln") {
    const beatLength = 60000 / effectiveBPM;
    // Aggregate LN metrics across all cells in segment — single allocation
    // instead of growing the array with repeated concat.
    let totalNotes = 0;
    for (const cell of cells) totalNotes += cell._notes.length;
    const allNotes = new Array<NoteInfo>(totalNotes);
    let k = 0;
    for (const cell of cells) {
      const src = cell._notes;
      for (let m = 0; m < src.length; m++) allNotes[k++] = src[m]!;
    }
    const metrics = analyzeLNCell(allNotes, beatLength);
    const lnResult = classifyLNCell(metrics);
    lnSubtype = lnResult.lnSubtype;
    lnSubtypes = lnResult.lnSubtypes;
    keyType = lnSubtype ?? "Unknown LN";
  }

  if (category === "break") {
    keyType = "Break";
  }

  // Compute jack density (purity) for jack/stream segments
  let jackDensity = 0;
  if (category === "jack") {
    jackDensity = computeSegmentDensity(cells, effectiveBPM, beatmap);
  }

  return {
    cells,
    category,
    effectiveBPM,
    subdivision,
    startTime: first.startTime,
    endTime: last.endTime,
    startBeat: first.beatIndex,
    endBeat: last.beatIndex + 1,
    gridTotalNotes,
    avgPerRow,
    maxBeat,
    grade,
    keyType,
    rowNotes,
    jackDensity,
    lnSubtype,
    lnSubtypes,
  };
}

// ---------------------------------------------------------------------------
// BPM Merge & Summary
// ---------------------------------------------------------------------------

export function mergeBPMKeyTypes(segments: SegmentResult[]): BPMKeyType[] {
  // Group segments by (keyType, effectiveBPM rounded to nearest 10)
  const grouped = new Map<string, SegmentResult[]>();

  for (const seg of segments) {
    if (seg.category === "break") continue;
    // Round BPM to nearest 10 for grouping
    const bpmKey = Math.round(seg.effectiveBPM / 10) * 10;
    const groupKey = `${seg.keyType}|${bpmKey}`;
    const arr = grouped.get(groupKey) ?? [];
    arr.push(seg);
    grouped.set(groupKey, arr);
  }

  const result: BPMKeyType[] = [];
  const totalCells = segments.reduce((sum, s) => sum + (s.category !== "break" ? s.cells.length : 0), 0);

  for (const [, segs] of grouped) {
    // Get mode BPM
    const bpmCounts = new Map<number, number>();
    for (const s of segs) {
      const bpm = Math.round(s.effectiveBPM);
      bpmCounts.set(bpm, (bpmCounts.get(bpm) ?? 0) + 1);
    }
    let modeBPM = segs[0]!.effectiveBPM;
    let maxCount = 0;
    for (const [bpm, cnt] of bpmCounts) {
      if (cnt > maxCount) {
        maxCount = cnt;
        modeBPM = bpm;
      }
    }

    const cellCount = segs.reduce((sum, s) => sum + s.cells.length, 0);
    result.push({
      keyType: segs[0]!.keyType,
      bpm: modeBPM,
      cellCount,
      percentage: totalCells > 0 ? (cellCount / totalCells) * 100 : 0,
    });
  }

  // Sort by percentage descending
  result.sort((a, b) => b.percentage - a.percentage);

  return result;
}
