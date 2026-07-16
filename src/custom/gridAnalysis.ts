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
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CellCategory = "jack" | "stream" | "ln" | "break";

export interface NoteInfo {
  col: number;
  start: number;
  end: number;
  isLN: boolean;
}

export interface CellResult {
  /** 0-based beat index */
  beatIndex: number;
  startTime: number;
  endTime: number;
  category: CellCategory;
  /** Detected subdivision denominator (2,3,4,6,8,12), null for LN/break */
  subdivision: number | null;
  /** rawBPM × (subdivision / 4) */
  effectiveBPM: number;
  noteCount: number;
  lnRatio: number;
  /** Per-beat note counts within this cell (4 beats per cell) */
  beatNotes: number[];
}

export interface SegmentResult {
  cells: CellResult[];
  category: CellCategory;
  effectiveBPM: number;
  subdivision: number;
  startTime: number;
  endTime: number;
  startBeat: number;
  endBeat: number;
  /** 4×4 grid: total notes across all 16 cells */
  gridTotalNotes: number;
  /** avg notes per row = gridTotalNotes / 4 */
  avgPerRow: number;
  /** max notes in any single row */
  maxBeat: number;
  /** Jack/stream grade string */
  grade: string;
  /** Final key type classification */
  keyType: string;
  /** 4 row totals from the grid (per-time-row note counts) */
  rowNotes: number[];
  /** For LN: triggered subtypes */
  lnSubtype: string | null;
  lnSubtypes: Array<{ key: string; name: string; value: string }>;
}

export interface BPMKeyType {
  keyType: string;
  bpm: number;
  cellCount: number;
  percentage: number;
}

export interface GridAnalysisResult {
  cells: CellResult[];
  segments: SegmentResult[];
  bpmKeyTypes: BPMKeyType[];
  mainKeyType: BPMKeyType;
  bpmRange: { min: number; max: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Global BPM from the first uninherited timing point. Used only for cell grid layout. */
function getFirstBPM(beatmap: ParsedBeatmap): number {
  const uninherited = beatmap.timingPoints.find((tp) => tp.uninherited);
  if (uninherited && uninherited.beatLength > 0) {
    return Math.round((60000 / uninherited.beatLength) * 100) / 100;
  }
  return 120;
}

function getFirstBeatLength(beatmap: ParsedBeatmap): number {
  return 60000 / getFirstBPM(beatmap);
}

/**
 * Find the active uninherited timing point at a given timestamp.
 * SV maps have multiple timing points with different BPMs.
 */
function getActiveTimingPoint(beatmap: ParsedBeatmap, time: number): TimingPoint | null {
  let active: TimingPoint | null = null;
  for (const tp of beatmap.timingPoints) {
    if (!tp.uninherited) continue;
    if (tp.time <= time) {
      if (!active || tp.time >= active.time) active = tp;
    }
  }
  return active;
}

/** BPM from the active timing point at `time`. */
function getActiveBPM(beatmap: ParsedBeatmap, time: number): number {
  const tp = getActiveTimingPoint(beatmap, time);
  if (tp && tp.beatLength > 0) {
    return Math.round((60000 / tp.beatLength) * 100) / 100;
  }
  return getFirstBPM(beatmap);
}

/** Beat length from the active timing point at `time`. */
function getActiveBeatLength(beatmap: ParsedBeatmap, time: number): number {
  return 60000 / getActiveBPM(beatmap, time);
}

function getNotesInRange(
  beatmap: ParsedBeatmap,
  startTime: number,
  endTime: number,
): NoteInfo[] {
  const notes: NoteInfo[] = [];
  for (let i = 0; i < beatmap.noteStarts.length; i++) {
    const t = beatmap.noteStarts[i]!;
    if (t >= startTime && t < endTime) {
      notes.push({
        col: beatmap.columns[i]!,
        start: t,
        end: (beatmap.noteTypes[i]! & 128) !== 0 ? beatmap.noteEnds[i]! : t,
        isLN: (beatmap.noteTypes[i]! & 128) !== 0,
      });
    }
  }
  return notes;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// ---------------------------------------------------------------------------
// Subdivision Detection
// ---------------------------------------------------------------------------

interface SubdivisionCandidate {
  denom: number;
  interval: number;
  count: number;  // consecutive match count
}

/**
 * Detect the finest subdivision based on minimum non-zero interval.
 * Accepts a candidate if at least one interval matches its target (±20%).
 * For denser cells (≥3 non-zero intervals), requires 2+ consecutive matches.
 * Gracefully handles chords by skipping 0-delay intervals.
 * Returns null if no subdivision detected → treat as grace.
 */
function detectSubdivision(
  notes: NoteInfo[],
  beatLength: number,
): SubdivisionCandidate | null {
  if (notes.length < 2) return null;

  // Possible subdivisions and their target intervals
  const candidates: number[] = [2, 3, 4, 6, 8, 12];
  const tolerance = 0.20; // 20% jitter tolerance

  // Compute all non-zero intervals between consecutive notes
  const intervals: number[] = [];
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i]!.start - sorted[i - 1]!.start;
    if (dt > 0) intervals.push(dt); // skip 0-delay (chords)
  }

  if (intervals.length === 0) return null;

  let best: SubdivisionCandidate | null = null;

  for (const denom of candidates) {
    const target = beatLength / denom;

    // Count intervals matching target at 1×
    let matchCount1x = 0;
    for (const dt of intervals) {
      if (Math.abs(dt - target) < target * tolerance) {
        matchCount1x++;
      }
    }

    // Require at least one 1× interval match
    if (matchCount1x === 0) continue;

    // For cells with 2+ non-zero intervals, check consecutive run quality
    let maxConsecutive = 0;
    let currentRun = 0;
    for (const dt of intervals) {
      if (Math.abs(dt - target) < target * tolerance) {
        currentRun++;
        if (currentRun > maxConsecutive) maxConsecutive = currentRun;
      } else {
        currentRun = 0;
      }
    }

    // Accept: must have at least 1 matching interval;
    // if 2+ intervals exist, require at least 2 consecutive
    if (intervals.length < 2 || maxConsecutive >= 2) {
      // Prefer finer subdivisions (higher denom) as they represent faster play
      if (!best || denom > best.denom) {
        best = { denom, interval: target, count: maxConsecutive };
      }
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Jack Detection
// ---------------------------------------------------------------------------

/**
 * Minimum ratio of jack pairs to total adjacent note pairs required
 * for a cell to be classified as "jack". Used only in cross-cell detection.
 */
const JACK_RATIO_THRESHOLD = 0.33;

/**
 * Strict minijack detection within a single cell.
 *
 * Checks for same-column note pairs at 1-2× sub-beat intervals where
 * there are NO notes of other columns between them (interruption check).
 * This catches true minijacks (e.g., col1, col1, col2, col3) while
 * rejecting stream/jumpstream patterns where other columns intervene.
 *
 * Chordjacks where each column appears once per cell are NOT caught here;
 * they are handled by detectCrossCellJacks below. This is intentional:
 * at 8th-note chordjack (denom=2, the common case), each column only
 * appears once per cell, so detectJack has nothing to check.
 */
function detectJack(
  notes: NoteInfo[],
  beatLength: number,
  subdivision: number,
): boolean {
  const rice = notes.filter((n) => !n.isLN);
  if (rice.length < 2) return false;

  // For interruption checking: all notes sorted by time
  const timeSorted = [...rice].sort((a, b) => a.start - b.start);

  const subInterval = beatLength / subdivision;
  const tolerance = subInterval * 0.25;

  // Group by column to find same-column pairs
  const colNotes = new Map<number, NoteInfo[]>();
  for (const n of rice) {
    const arr = colNotes.get(n.col) ?? [];
    arr.push(n);
    colNotes.set(n.col, arr);
  }

  // Check each column for consecutive same-column notes at sub-beat intervals
  // with NO interrupting notes of other columns between them
  for (const [, colNts] of colNotes) {
    if (colNts.length < 2) continue;
    const sortedCol = colNts.sort((a, b) => a.start - b.start);
    for (let i = 0; i < sortedCol.length - 1; i++) {
      const dt = sortedCol[i + 1]!.start - sortedCol[i]!.start;
      if (Math.abs(dt - subInterval) < tolerance ||
          Math.abs(dt - subInterval * 2) < tolerance) {

        // Interruption check: are there notes of other columns between?
        const t1 = sortedCol[i]!.start;
        const t2 = sortedCol[i + 1]!.start;
        let hasInterruption = false;
        for (const n of timeSorted) {
          if (n.start > t1 && n.start < t2 && n.col !== sortedCol[i]!.col) {
            hasInterruption = true;
            break;
          }
        }

        if (!hasInterruption) return true; // pure minijack
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Cross-cell Jack Detection
// ---------------------------------------------------------------------------

/**
 * Post-process: detect jacks that span cell boundaries.
 *
 * Problem: In chordjack/minijack patterns, each column typically appears
 * only ONCE per beat cell (e.g., 8th-note chordjack at 374 BPM gives
 * 2 notes per beat, but each column hits at most every other 8th).
 * Per-cell detectJack misses these because no column has 2+ notes/cell.
 *
 * Solution: For each "stream" cell, look at a 2-cell window (current + next).
 * Count jack pairs vs total adjacent pairs using the same ratio threshold
 * as detectJack. Reclassify as "jack" only when the ratio is high enough.
 */
function detectCrossCellJacks(
  cells: CellResult[],
  beatmap: ParsedBeatmap,
): void {
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (cell.category !== "stream") continue;

    // Only run on cells with 8th-note subdivision or coarser (denom <= 2).
    // At denom=2, each column appears at most once per cell, so same-column
    // pairs only exist across the cell boundary — cross-cell detection is
    // necessary. At finer subdivisions (denom >= 3), columns can repeat
    // within a cell, and the strict detectJack() handles true minijacks.
    // Applying cross-cell detection at denom >= 4 causes false positives
    // in dense jumpstream/handstream patterns where columns naturally
    // repeat at sub-beat intervals across cell boundaries.
    const subdivDenom = cell.subdivision ?? 4;
    if (subdivDenom > 2) continue;

    const endIdx = Math.min(i + 2, cells.length);
    if (endIdx - i < 2) continue;

    const allNotes = getNotesInRange(beatmap, cell.startTime, cells[endIdx - 1]!.endTime);
    const rice = allNotes.filter((n) => !n.isLN);
    if (rice.length < 2) continue;

    // Total adjacent pairs
    const sortedByTime = [...rice].sort((a, b) => a.start - b.start);
    const totalPairs = sortedByTime.length - 1;

    // Per-cell beatLength from active timing point
    const cellBeatLength = getActiveBeatLength(beatmap, cell.startTime);
    const subInterval = cellBeatLength / subdivDenom;
    const tolerance = subInterval * 0.25;

    // Count jack pairs
    const colNotes = new Map<number, NoteInfo[]>();
    for (const n of rice) {
      const arr = colNotes.get(n.col) ?? [];
      arr.push(n);
      colNotes.set(n.col, arr);
    }

    let jackPairs = 0;
    for (const [, notes] of colNotes) {
      if (notes.length < 2) continue;
      const sorted = notes.sort((a, b) => a.start - b.start);
      for (let j = 0; j < sorted.length - 1; j++) {
        const dt = sorted[j + 1]!.start - sorted[j]!.start;
        if (Math.abs(dt - subInterval) < tolerance ||
            Math.abs(dt - subInterval * 2) < tolerance) {
          jackPairs++;
        }
      }
    }

    if (jackPairs / totalPairs >= JACK_RATIO_THRESHOLD) {
      cell.category = "jack";
    }
  }
}

// ---------------------------------------------------------------------------
// Per-beat structure
// ---------------------------------------------------------------------------

/**
 * Count notes per beat within a cell (sub-beats: 4 per cell at 1/4 reference).
 * Returns [beat0_notes, beat1_notes, beat2_notes, beat3_notes].
 */
function computeBeatStructure(
  notes: NoteInfo[],
  cellStart: number,
  beatLength: number,
): { structure: number[]; maxBeat: number } {
  const structure = [0, 0, 0, 0];
  const subBeat = beatLength / 4; // 1/16 note
  for (const n of notes) {
    const relTime = n.start - cellStart;
    const idx = Math.min(3, Math.max(0, Math.floor(relTime / subBeat + 0.001)));
    structure[idx]++;
  }
  const maxBeat = Math.max(...structure);
  return { structure, maxBeat };
}

// ---------------------------------------------------------------------------
// Density Grading (from existing jackAnalysis.ts / streamAnalysis.ts)
// ---------------------------------------------------------------------------

/**
 * Jack density grade: based on total notes in 4-row window.
 */
export function gradeJack(maxWindowNotes: number, medWindowNotes: number): string {
  const m = Number.isInteger(maxWindowNotes) ? maxWindowNotes.toString() : maxWindowNotes.toFixed(1);
  const d = medWindowNotes.toFixed(1);
  if (maxWindowNotes <= 4) return `Mini (${m}/${d})`;
  if (maxWindowNotes <= 7) return `Low (${m}/${d})`;
  if (maxWindowNotes <= 11) return `Mid (${m}/${d})`;
  return `Dense (${m}/${d})`;
}

/**
 * Stream density grade: based on avg notes per row.
 */
export function gradeStream(maxWindowNotes: number, medWindowNotes: number): string {
  const avgPerRow = maxWindowNotes / 4;
  const m = Number.isInteger(maxWindowNotes) ? maxWindowNotes.toString() : maxWindowNotes.toFixed(1);
  const d = medWindowNotes.toFixed(1);
  if (avgPerRow <= 1.0) return `Single (${m}/${d})`;
  if (avgPerRow <= 1.25) return `Light (${m}/${d})`;
  if (avgPerRow <= 1.5) return `Mid (${m}/${d})`;
  if (avgPerRow <= 2.0) return `Dense (${m}/${d})`;
  return `Heavy (${m}/${d})`;
}

// ---------------------------------------------------------------------------
// Key Type Classification
// ---------------------------------------------------------------------------

interface KeyTypeResult {
  keyType: string;
  grade: string;
}

function classifyJack(totalNotes: number): KeyTypeResult {
  const medNotes = totalNotes; // In grid mode, max=med since it's a single window
  const grade = gradeJack(totalNotes, medNotes);
  if (totalNotes <= 7) return { keyType: "Minijack", grade };
  return { keyType: "High Chordjack", grade };
}

function classifyStream(
  totalNotes: number,
  maxBeat: number,
  rowNotes: number[],
): KeyTypeResult {
  const avgPerRow = totalNotes / 4;
  const grade = gradeStream(totalNotes, totalNotes);

  // Determine JS vs HS by maxBeat
  const isHS = maxBeat >= 3;

  // Roll vs Trill: single-note-per-row patterns
  // If consecutive non-empty rows alternate columns → trill, else roll
  let isRoll = false;
  if (avgPerRow <= 1.0 && maxBeat === 1) {
    isRoll = true; // default singles → rolls
  }

  if (avgPerRow <= 1.0) {
    if (isRoll) return { keyType: "Rolls", grade };
    return { keyType: "Minitrills", grade };
  }

  if (avgPerRow < 1.25) {
    return { keyType: "Low Jumpstream", grade };
  }

  if (isHS) {
    if (avgPerRow >= 2.0) return { keyType: "Full Handstream", grade };
    if (avgPerRow >= 1.75) return { keyType: "High Handstream", grade };
    if (avgPerRow >= 1.5) return { keyType: "Mid Handstream", grade };
    return { keyType: "Low Handstream", grade };
  } else {
    if (avgPerRow >= 2.0) return { keyType: "Full Jumpstream", grade };
    if (avgPerRow >= 1.5) return { keyType: "High Jumpstream", grade };
    if (avgPerRow >= 1.25) return { keyType: "Mid Jumpstream", grade };
    return { keyType: "Low Jumpstream", grade };
  }
}

// ---------------------------------------------------------------------------
// LN Subtype Detection (from sectionAnalysis.ts)
// ---------------------------------------------------------------------------

interface LNMetrics {
  inverse: number;
  overlay: number;
  ar: number;
  tapLN: number;
  ouroboros: number;
}

function analyzeLNCell(notes: NoteInfo[], beatLength: number): LNMetrics {
  const lns = notes.filter((n) => n.isLN);
  if (lns.length === 0) return { inverse: 0, overlay: 0, ar: 0, tapLN: 0, ouroboros: 0 };

  // Tap LN: ≤ beatLength/4
  const maxTap = beatLength / 4;
  const tapCount = lns.filter((ln) => ln.end - ln.start <= maxTap).length;
  const tapLN = (tapCount / lns.length) * 100;

  // Inverse: ≥2 columns with ≥2 LN bodies
  const colBodies = new Map<number, number>();
  for (const ln of lns) colBodies.set(ln.col, (colBodies.get(ln.col) ?? 0) + 1);
  const invCols = [...colBodies.values()].filter((v) => v >= 2).length;
  const inverse = (invCols / lns.length) * 100;

  // Overlay
  let overlayCount = 0;
  for (let i = 0; i < lns.length; i++) {
    for (let j = i + 1; j < lns.length; j++) {
      if (lns[i]!.start < lns[j]!.start && lns[i]!.end > lns[j]!.start) overlayCount++;
    }
  }
  const overlay = (overlayCount / lns.length) * 100;

  // A/R
  let arCount = 0;
  for (let i = 0; i < lns.length; i++) {
    for (let j = i + 1; j < lns.length; j++) {
      if (lns[i]!.start !== lns[j]!.start && lns[i]!.end === lns[j]!.end) arCount++;
    }
  }
  const ar = (arCount / lns.length) * 100;

  // Ouroboros: head/tail gap < 5ms
  let ouroCount = 0;
  for (const a of lns) {
    for (const b of lns) {
      if (a === b) continue;
      if (Math.abs(a.end - b.start) < 5) ouroCount++;
    }
  }
  const ouroboros = (ouroCount / lns.length) * 100;

  return { inverse, overlay, ar, tapLN, ouroboros };
}

const LN_TYPE_COLORS: Record<string, string> = {
  reverse: "#9b59b6",
  releasehell: "#e74c3c",
  density: "#3498db",
  ouroboros: "#1abc9c",
  unknown: "#7f8c8d",
};

function classifyLNCell(
  metrics: LNMetrics,
): { lnSubtype: string; lnSubtypes: Array<{ key: string; name: string; value: string }> } {
  const triggered: Array<{ key: string; name: string; value: string }> = [];

  if (metrics.inverse >= 20) {
    triggered.push({ key: "reverse", name: "LN Inverse", value: `${Math.round(metrics.inverse)}%` });
  }
  if (metrics.overlay >= 30 && metrics.ar >= 20) {
    triggered.push({ key: "releasehell", name: "Release Hell", value: `Ov${Math.round(metrics.overlay)}/AR${Math.round(metrics.ar)}` });
  }
  if (metrics.tapLN >= 40) {
    triggered.push({ key: "density", name: "Density", value: `Tap${Math.round(metrics.tapLN)}%` });
  }
  if (metrics.ouroboros >= 30) {
    triggered.push({ key: "ouroboros", name: "Ouroboros", value: `${Math.round(metrics.ouroboros)}%` });
  }

  // First match wins for primary subtype
  let lnSubtype = "LN Unknown";
  if (metrics.inverse >= 20) lnSubtype = "LN Inverse";
  else if (metrics.overlay >= 30 && metrics.ar >= 20) lnSubtype = "Release Hell";
  else if (metrics.tapLN >= 40) lnSubtype = "Density";
  else if (metrics.ouroboros >= 30) lnSubtype = "Ouroboros";

  return { lnSubtype, lnSubtypes: triggered };
}

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
function buildGrid(
  segmentCells: CellResult[],
  effectiveBPM: number,
  _subdivision: number,
  beatmap: ParsedBeatmap,
): {
  gridNotes: number;
  maxBeat: number;
  avgPerRow: number;
  rowNotes: number[];
} {
  const beatLength = 60000 / effectiveBPM;
  const rowDuration = beatLength / 4; // 1/4 beat at effective BPM

  // Grid covers 4 rows → total time span = 4 × rowDuration
  const gridStart = segmentCells[0]!.startTime;

  // Collect notes per grid row (all columns combined)
  const rowNotes: number[] = [];
  for (let row = 0; row < 4; row++) {
    const rowStart = gridStart + row * rowDuration;
    const rowEnd = rowStart + rowDuration;
    const rowNotes_count = getNotesInRange(beatmap, rowStart, rowEnd).length;
    rowNotes.push(rowNotes_count);
  }

  const totalNotes = rowNotes.reduce((a, b) => a + b, 0);
  const maxBeat = Math.max(...rowNotes, 1);
  const avgPerRow = totalNotes / 4;

  return { gridNotes: totalNotes, maxBeat, avgPerRow, rowNotes };
}

// ---------------------------------------------------------------------------
// Segment Builder
// ---------------------------------------------------------------------------

/**
 * Group cells into contiguous segments of same category + similar BPM.
 */
function buildSegments(
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

function createSegment(
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

    // Tech reclassification: BPM ≥ 250
    if (effectiveBPM >= 250) {
      if (keyType === "Minijack") {
        keyType = "Jacky Tech";
      } else if (keyType === "Rolls" || keyType === "Minitrills") {
        keyType = "Speedy Tech";
      }
    }
  }

  // LN segment
  let lnSubtype: string | null = null;
  let lnSubtypes: Array<{ key: string; name: string; value: string }> = [];
  if (category === "ln") {
    const beatLength = 60000 / effectiveBPM;
    // Aggregate LN metrics across all cells in segment
    const allNotes = getNotesInRange(beatmap, first.startTime, last.endTime);
    const metrics = analyzeLNCell(allNotes, beatLength);
    const lnResult = classifyLNCell(metrics);
    lnSubtype = lnResult.lnSubtype;
    lnSubtypes = lnResult.lnSubtypes;
    keyType = lnSubtype ?? "Unknown LN";
  }

  if (category === "break") {
    keyType = "Break";
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
    lnSubtype,
    lnSubtypes,
  };
}

// ---------------------------------------------------------------------------
// BPM Merge & Summary
// ---------------------------------------------------------------------------

function mergeBPMKeyTypes(segments: SegmentResult[]): BPMKeyType[] {
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

// ---------------------------------------------------------------------------
// Main Analysis
// ---------------------------------------------------------------------------

/**
 * Run the full cell-based grid analysis on a parsed beatmap.
 */
export function analyzeGrid(beatmap: ParsedBeatmap, signal?: AbortSignal): GridAnalysisResult | null {
  // Skip grid analysis for maps with 5000+ notes — the experimental grid
  // does not scale to ultra-long beatmaps (200k notes, 2-hour maps).
  if (beatmap.noteStarts.length > 5000) return null;

  // Grid layout uses the FIRST timing point's beat length.
  // Each cell then uses its own active timing point for BPM/beatLength.
  const firstBPM = getFirstBPM(beatmap);
  const firstBeatLength = getFirstBeatLength(beatmap);
  const duration = beatmap.duration;
  const totalBeats = Math.max(1, Math.ceil(duration / firstBeatLength));

  // Phase 1: Classify each beat cell
  const cells: CellResult[] = [];

  // Global grace counter: track how many cells have possible 1/6, 1/8, 1/12 intervals
  // If a subdivision appears in >30% of cells, it's not grace
  const globalSubdivCounts = new Map<number, number>();
  let totalAnalyzableCells = 0;

  for (let beat = 0; beat < totalBeats; beat++) {
    // Check cancellation periodically (every 50 beats)
    if (beat % 50 === 0) signal?.throwIfAborted();
    const cellStart = beat * firstBeatLength;
    const cellEnd = cellStart + firstBeatLength;

    // Per-cell timing from the active timing point at this cell's start
    const cellRawBPM = getActiveBPM(beatmap, cellStart);
    const cellBeatLength = getActiveBeatLength(beatmap, cellStart);

    const notes = getNotesInRange(beatmap, cellStart, cellEnd);
    const noteCount = notes.length;
    const lnNotes = notes.filter((n) => n.isLN).length;
    const lnRatio = noteCount > 0 ? lnNotes / noteCount : 0;

    // Break: no notes or very sparse
    if (noteCount === 0) {
      cells.push({
        beatIndex: beat, startTime: cellStart, endTime: cellEnd,
        category: "break", subdivision: null, effectiveBPM: 0,
        noteCount: 0, lnRatio: 0, beatNotes: [0, 0, 0, 0],
      });
      continue;
    }

    // LN: ≥50% are LNs
    if (lnRatio >= 0.5) {
      cells.push({
        beatIndex: beat, startTime: cellStart, endTime: cellEnd,
        category: "ln", subdivision: null, effectiveBPM: cellRawBPM,
        noteCount, lnRatio, beatNotes: [0, 0, 0, 0],
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
    const { structure, maxBeat: _mb } = computeBeatStructure(notes, cellStart, cellBeatLength);

    cells.push({
      beatIndex: beat, startTime: cellStart, endTime: cellEnd,
      category: isJack ? "jack" : "stream",
      subdivision: subdivDenom,
      effectiveBPM: Math.round(effectiveBPM),
      noteCount, lnRatio,
      beatNotes: structure,
    });
  }

  // Global grace correction: if a low subdivision appears in >30% of cells,
  // reclassify cells that were marked as "no subdivision" (grace) but have that interval
  const graceThreshold = 0.30;
  for (const [denom, count] of globalSubdivCounts) {
    if (denom >= 6 && totalAnalyzableCells > 0 && count / totalAnalyzableCells >= graceThreshold) {
      // This subdivision is prevalent → reclassify grace cells
      for (const cell of cells) {
        if (cell.category === "break" || cell.category === "ln") continue;
        if (cell.subdivision !== null) continue; // already has subdivision

        // Re-check with this subdivision, using per-cell active timing
        const notes = getNotesInRange(beatmap, cell.startTime, cell.endTime);
        const cellBeatLength = getActiveBeatLength(beatmap, cell.startTime);
        const cellRawBPM = getActiveBPM(beatmap, cell.startTime);
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

  // Phase 2: Build segments
  const segments = buildSegments(cells, beatmap);

  // Phase 3: BPM merge
  const bpmKeyTypes = mergeBPMKeyTypes(segments);

  // Phase 4: Main key type and BPM range
  const mainKeyType = bpmKeyTypes.length > 0
    ? bpmKeyTypes[0]!
    : { keyType: "Unknown", bpm: firstBPM, cellCount: 0, percentage: 100 };

  const effectiveBPMs = cells
    .filter((c) => c.effectiveBPM > 0 && c.category !== "break")
    .map((c) => c.effectiveBPM);
  const bpmRange = {
    min: effectiveBPMs.length > 0 ? Math.min(...effectiveBPMs) : firstBPM,
    max: effectiveBPMs.length > 0 ? Math.max(...effectiveBPMs) : firstBPM,
  };

  return { cells, segments, bpmKeyTypes, mainKeyType, bpmRange };
}

// Re-export colors for display
export { LN_TYPE_COLORS };
