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

import type { ParsedBeatmap, TimingPoint } from "../types/beatmap.js";

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
  /** True when detectSubdivision returned null (no standard subdivision found) */
  isGrace?: boolean;
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
  /** Per-run per-cell key type breakdown for display (e.g. "SS 34% + Low JS 33%") */
  streamBreakdown: string;
  /** Grid-based switch: max jack↔stream transitions in any 4-cell (16-row) window */
  gridSwitch: number;
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

    // For cells with 2+ non-zero intervals, check consecutive run quality.
    // Finer subdivisions require more consecutive matches to avoid
    // misclassifying irregular grace patterns (e.g., pairs of 50ms notes
    // with gaps between them) as 32nd/48th note streams.
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

    // Consecutive match requirements per subdivision
    const minConsecutive = denom <= 4 ? 2 : denom <= 8 ? 3 : 4;

    // Accept: must have at least 1 matching interval;
    // if 2+ intervals exist, require enough consecutive matches
    if (intervals.length < 2 || maxConsecutive >= minConsecutive) {
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

    // Use a 3-cell window for better jack pair statistics.
    // 2 cells only give 4 same-column candidates at denom=2, which can
    // miss chordjack patterns where columns don't repeat at 1-2× subInterval.
    const endIdx = Math.min(i + 3, cells.length);
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
        // Check 1×, 2×, 3×, and 4× subInterval.
        // Chordjack at denom=2 has same-column interval = 4× subInterval
        // (4 notes per cell, one per column, repeated each cell).
        if (Math.abs(dt - subInterval) < tolerance ||
            Math.abs(dt - subInterval * 2) < tolerance ||
            Math.abs(dt - subInterval * 3) < tolerance ||
            Math.abs(dt - subInterval * 4) < tolerance) {
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
  if (avgPerRow <= 1.125) return `Single (${m}/${d})`;
  if (avgPerRow <= 1.25) return `Light (${m}/${d})`;
  if (avgPerRow <= 1.5) return `Mid (${m}/${d})`;
  if (avgPerRow < 2.0) return `Dense (${m}/${d})`;
  if (avgPerRow === 2.0) return `Full (${m}/${d})`;
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
    // Only classify as handstream when consistently dense (avgPerRow ≥ 1.75 = 3121).
    // 3111 patterns (avgPerRow = 1.5, one row with 3 notes = chord in dense JS)
    // are common in dense jumpstream and should NOT be classified as handstream.
    if (avgPerRow >= 2.0) return { keyType: "Full Handstream", grade };
    if (avgPerRow >= 1.75) return { keyType: "High Handstream", grade };
  }
  // Jumpstream path (also covers sparse HS patterns below handstream threshold)
  if (avgPerRow >= 2.0) return { keyType: "Full Jumpstream", grade };
  if (avgPerRow >= 1.5) return { keyType: "High Jumpstream", grade };
  if (avgPerRow > 1.25) return { keyType: "Mid Jumpstream", grade };
  return { keyType: "Low Jumpstream", grade };
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
  shield: number;
  reversedShield: number;
  columnLock: number;
  jsDensity: number;
  hsDensity: number;
  speedyWC: number;
  jackyWC: number;
}

function analyzeLNCell(notes: NoteInfo[], beatLength: number): LNMetrics {
  const LN_WIN = 83; // LN_TIME_WINDOW_MS
  const lns = notes.filter((n) => n.isLN);
  const normals = notes.filter((n) => !n.isLN);
  if (lns.length === 0) return { inverse: 0, overlay: 0, ar: 0, tapLN: 0, ouroboros: 0, shield: 0, reversedShield: 0, columnLock: 0, jsDensity: 0, hsDensity: 0, speedyWC: 0, jackyWC: 0 };

  // Tap LN: ≤ beatLength/4
  const maxTap = beatLength / 4;
  const tapCount = lns.filter((ln) => ln.end - ln.start <= maxTap).length;
  const tapLN = (tapCount / lns.length) * 100;

  // Inverse: ≥2 columns with ≥2 LN bodies
  const colBodies = new Map<number, number>();
  for (const ln of lns) colBodies.set(ln.col, (colBodies.get(ln.col) ?? 0) + 1);
  const invCols = [...colBodies.values()].filter((v) => v >= 2).length;
  const inverse = (invCols / lns.length) * 100;

  // Overlay (time overlap)
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

  // Ouroboros: head/tail gap < 21ms (LN_TIME_WINDOW_MS/4)
  let ouroCount = 0;
  for (const a of lns) {
    for (const b of lns) {
      if (a === b) continue;
      if (Math.abs(a.end - b.start) < 21) ouroCount++;
    }
  }
  const ouroboros = (ouroCount / lns.length) * 100;

  // Shield: N→H same col ≤83ms
  let shieldCount = 0;
  for (const n of normals) {
    for (const ln of lns) {
      if (ln.col === n.col && ln.start > n.start && ln.start - n.start <= LN_WIN) {
        shieldCount++; break;
      }
    }
  }
  const shield = (shieldCount / Math.max(1, normals.length)) * 100;

  // Reversed Shield: T→N same col ≤83ms
  let revShieldCount = 0;
  for (const ln of lns) {
    for (const n of normals) {
      if (n.col === ln.col && n.start > ln.end && n.start - ln.end <= LN_WIN) {
        revShieldCount++; break;
      }
    }
  }
  const reversedShield = (revShieldCount / lns.length) * 100;

  // ColumnLock: LN body active + same-hand neighbor ≥2 hits (per-LN check)
  const HANDS: [number, number][] = [[0,1],[2,3]];
  let colLockCount = 0;
  for (const ln of lns) {
    const hand = HANDS.find(h => h[0] === ln.col || h[1] === ln.col);
    if (!hand) continue;
    const adjCol = hand[0] === ln.col ? hand[1] : hand[0];
    // Count neighbor hits during LN body (exclude LN's own start, include body and end time)
    let neighborHits = 0;
    for (const n of notes) {
      if (n.col !== adjCol) continue;
      // Note must overlap with LN body time (start < n.start < end, or n is the LN itself)
      if (n.start >= ln.start && n.start <= ln.end) neighborHits++;
    }
    if (neighborHits >= 2) colLockCount++;
  }
  const columnLock = (colLockCount / lns.length) * 100;

  // JS/HS Density: LN heads forming chord patterns (count heads, not timestamps)
  const timeCols = new Map<number, number[]>();
  for (const ln of lns) {
    // Group by start time with 5ms tolerance for simultaneous heads
    let key = ln.start;
    for (const k of timeCols.keys()) { if (Math.abs(k - ln.start) <= 5) { key = k; break; } }
    const entries = timeCols.get(key) ?? [];
    entries.push(ln.col);
    timeCols.set(key, entries);
  }
  let jsHeads = 0, hsHeads = 0;
  for (const cols of timeCols.values()) {
    if (cols.length >= 3) hsHeads += cols.length;
    else if (cols.length === 2) jsHeads += cols.length;
  }
  const jsDensity = lns.length > 0 ? (jsHeads / lns.length) * 100 : 0;
  const hsDensity = lns.length > 0 ? (hsHeads / lns.length) * 100 : 0;

  // Speedy WC / Jacky WC: all notes (LN heads + normals) directional/jack patterns
  // Group ALL notes by time to form rows, then check adjacent row patterns
  const allTimeCols = new Map<number, number[]>();
  for (const n of notes) {
    let key = n.start;
    for (const k of allTimeCols.keys()) { if (Math.abs(k - n.start) <= 5) { key = k; break; } }
    const entries = allTimeCols.get(key) ?? [];
    if (!entries.includes(n.col)) entries.push(n.col);
    allTimeCols.set(key, entries);
  }
  const allRows = [...allTimeCols.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, cols]) => ({ time: t, cols }));
  let speedyHeads = 0, jackyHeads = 0;
  for (let i = 1; i < allRows.length; i++) {
    const prev = allRows[i - 1]!, curr = allRows[i]!;
    const dt = curr.time - prev.time;
    if (dt <= 0) continue;
    // Same-column note repeat (LN or normal) → jacky pattern
    if (curr.cols.some(c => prev.cols.includes(c))) jackyHeads += curr.cols.length;
    // Directional movement (all columns shift left or right)
    const prevMin = Math.min(...prev.cols), prevMax = Math.max(...prev.cols);
    const currMin = Math.min(...curr.cols), currMax = Math.max(...curr.cols);
    if (currMax < prevMin || currMin > prevMax) speedyHeads += curr.cols.length;
  }
  const totalNotes = notes.length;
  const speedyWC = totalNotes > 0 ? (speedyHeads / totalNotes) * 100 : 0;
  const jackyWC = totalNotes > 0 ? (jackyHeads / totalNotes) * 100 : 0;

  return { inverse, overlay, ar, tapLN, ouroboros, shield, reversedShield, columnLock, jsDensity, hsDensity, speedyWC, jackyWC };
}

const LN_TYPE_COLORS: Record<string, string> = {
  shield: "#e91e63",
  reversedshield: "#f06292",
  collock: "#ff9800",
  releasehell: "#e74c3c",
  inverse: "#9b59b6",
  ouroboros: "#1abc9c",
  jsdensity: "#42a5f5",
  hsdensity: "#1e88e5",
  speedywc: "#66bb6a",
  jackywc: "#ef5350",
  density: "#3498db",
  unknown: "#7f8c8d",
};

function classifyLNCell(
  metrics: LNMetrics,
): { lnSubtype: string; lnSubtypes: Array<{ key: string; name: string; value: string }> } {
  const triggered: Array<{ key: string; name: string; value: string }> = [];

  if (metrics.shield >= 15) {
    triggered.push({ key: "shield", name: "Shield", value: `Sh${Math.round(metrics.shield)}%` });
  }
  if (metrics.reversedShield >= 15) {
    triggered.push({ key: "reversedshield", name: "Reversed Shield", value: `RS${Math.round(metrics.reversedShield)}%` });
  }
  if (metrics.columnLock >= 15) {
    triggered.push({ key: "collock", name: "Column Lock", value: `CL${Math.round(metrics.columnLock)}%` });
  }
  if (metrics.overlay >= 30 && metrics.ar >= 20) {
    triggered.push({ key: "releasehell", name: "Timing Hell", value: `Ov${Math.round(metrics.overlay)}/AR${Math.round(metrics.ar)}` });
  }
  if (metrics.ouroboros >= 30) {
    triggered.push({ key: "ouroboros", name: "Ouroboros", value: `${Math.round(metrics.ouroboros)}%` });
  }
  if (metrics.inverse >= 20) {
    triggered.push({ key: "inverse", name: "LN Inverse", value: `${Math.round(metrics.inverse)}%` });
  }
  if (metrics.jsDensity >= 15) {
    triggered.push({ key: "jsdensity", name: "JS Density", value: `JS${Math.round(metrics.jsDensity)}%` });
  }
  if (metrics.hsDensity >= 10) {
    triggered.push({ key: "hsdensity", name: "HS Density", value: `HS${Math.round(metrics.hsDensity)}%` });
  }
  if (metrics.speedyWC >= 10) {
    triggered.push({ key: "speedywc", name: "Speedy WC", value: `Sp${Math.round(metrics.speedyWC)}%` });
  }
  if (metrics.jackyWC >= 10) {
    triggered.push({ key: "jackywc", name: "Jacky WC", value: `Jk${Math.round(metrics.jackyWC)}%` });
  }
  if (metrics.tapLN >= 40) {
    triggered.push({ key: "density", name: "Density", value: `Tap${Math.round(metrics.tapLN)}%` });
  }

  // Primary subtype: only from defining pool types (not companion patterns)
  let lnSubtype = "LN Unknown";
  if (metrics.overlay >= 30 && metrics.ar >= 20) lnSubtype = "Timing Hell";
  else if (metrics.inverse >= 20) lnSubtype = "LN Inverse";
  else if (metrics.ouroboros >= 30) lnSubtype = "Ouroboros";
  else if (metrics.speedyWC >= 10) lnSubtype = "Speedy WC";
  else if (metrics.jackyWC >= 10) lnSubtype = "Jacky WC";

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

  // Slide a 4-row window across each cell in the segment and pick the
  // window with the most notes (peak density). This avoids underestimating
  // density when the first cell happens to be sparse.
  let bestTotal = 0;
  let bestRowNotes: number[] = [0, 0, 0, 0];
  let bestMaxBeat = 1;

  for (const cell of segmentCells) {
    const rowNotes: number[] = [];
    for (let row = 0; row < 4; row++) {
      const rowStart = cell.startTime + row * rowDuration;
      const rowEnd = rowStart + rowDuration;
      rowNotes.push(getNotesInRange(beatmap, rowStart, rowEnd).length);
    }
    const total = rowNotes.reduce((a, b) => a + b, 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestRowNotes = rowNotes;
      bestMaxBeat = Math.max(...rowNotes, 1);
    }
  }

  return {
    gridNotes: bestTotal,
    maxBeat: bestMaxBeat,
    avgPerRow: bestTotal / 4,
    rowNotes: bestRowNotes,
  };
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
// Stream Run Analysis (replaces per-segment grid for stream cells)
// ---------------------------------------------------------------------------

interface StreamRun {
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
function analyzeStreamRuns(
  cells: CellResult[],
  beatmap: ParsedBeatmap,
): StreamRun[] {
  const runs: StreamRun[] = [];
  let i = 0;
  while (i < cells.length) {
    if (cells[i]!.category !== "stream") { i++; continue; }

    // Sliding-window helper
    const cellGrid = (cell: CellResult): { notes: number; maxBeat: number } => {
      const bpm = cell.effectiveBPM > 0 ? cell.effectiveBPM : 120;
      const bl = 60000 / bpm, rd = bl / 4;
      const rn = [0, 0, 0, 0];
      for (let r = 0; r < 4; r++) {
        const rs = cell.startTime + r * rd;
        rn[r] = getNotesInRange(beatmap, rs, rs + rd).length;
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
 * Classify a (gridTotalNotes, maxBeat) pair into a key type string
 * using the user's thresholds.
 */
function classifyStreamDensity(notes: number, maxBeat: number): string {
  const avg = notes / 4;

  // HS path (maxBeat ≥ 3)
  // 0.625→LowHS 1.25→LowHS 1.5→MidHS 1.5~1.75→HighHS 1.75+→FullHS
  if (maxBeat >= 3) {
    if (avg >= 2.0) return "Full Handstream";
    if (avg >= 1.75) return "Full Handstream";  // 1.75+ → Full HS
    if (avg > 1.5 + 0.001) return "High Handstream"; // 1.5~1.75 → High HS (run level)
    if (Math.abs(avg - 1.5) < 0.001) return "Mid Handstream"; // ≈1.5 → Mid HS
    if (avg >= 1.25) return "Low Handstream";   // 1.25~1.5 → Low HS
    // avg < 1.25: too dilute for HS, fall through to JS path
  }

  // JS / pure stream path
  // Per-cell gridTotalNotes is integer (4,5,6,7,8 → avg=1.0,1.25,1.5,1.75,2.0),
  // so Mid JS (1.25~1.5) and High Stream (1.125~1.25) only appear at run level.
  // Use tolerance for floating point === comparison.
  if (avg >= 2.0) return "Full Jumpstream";
  if (avg >= 1.5) return "High Jumpstream";     // 1.5~2 → High JS
  if (avg > 1.25 + 0.001) return "Mid Jumpstream"; // >1.25~1.5 → Mid JS
  if (Math.abs(avg - 1.25) < 0.001) return "Low Jumpstream"; // ≈1.25 → Low JS
  if (avg >= 1.125) return "High Stream";       // 1.125~1.25 → 大乱
  return "Single Stream";                        // <1.125 → 单乱
}

/**
 * Run-level density grade: uses the true mean density (total notes / total rows)
 * across the entire run, giving a continuous value instead of discrete P75.
 */
function streamRunGrade(results: Array<{ notes: number; maxBeat: number }>): string {
  if (results.length === 0) return "None";
  const totalNotes = results.reduce((s, r) => s + r.notes, 0);
  const totalRows = results.length * 4;
  const meanDensity = totalNotes / totalRows;

  let name: string;
  if (meanDensity <= 1.125) name = "Single";
  else if (meanDensity <= 1.25) name = "Light";
  else if (meanDensity <= 1.5) name = "Mid";
  else if (meanDensity < 2.0) name = "Dense";
  else if (meanDensity === 2.0) name = "Full";
  else name = "Heavy";

  return `${name} (${meanDensity.toFixed(2)})`;
}

/**
 * Decompose a stream run using its RUN-LEVEL mean density.
 * Each run produces ONE entry with the key type determined by the
 * continuous average density across the entire run (not per-cell).
 * This avoids the SS vs Low JS tie issue and properly captures
 * Mid JS / High Stream at mixed-density boundaries.
 */
function decomposeStreamRun(
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

  // Classify using P75 density
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

// ---------------------------------------------------------------------------
// Main Analysis
// ---------------------------------------------------------------------------

/**
 * Run the full cell-based grid analysis on a parsed beatmap.
 */
export function analyzeGrid(beatmap: ParsedBeatmap, signal?: AbortSignal): GridAnalysisResult | null {
  // Skip grid analysis for extremely long maps (50000+ notes) to avoid performance issues.
  if (beatmap.noteStarts.length > 50000) return null;

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

  // Phase 1: Classify each beat cell
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
      isGrace: !subdiv, // true when detectSubdivision returned null
      effectiveBPM: Math.round(effectiveBPM),
      noteCount, lnRatio,
      beatNotes: structure,
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

        const notes = getNotesInRange(beatmap, cell.startTime, cell.endTime);
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

  // Phase 4: BPM-aware main key type selection
  //
  // Principle: select the HARDER type that is still a significant part
  // of the map (not grace). Uses effective comparison BPM:
  //   - Jack: effBPM = BPM × 2  (90 BPM jack ≈ 180 BPM stream in difficulty)
  //   - Stream: effBPM = BPM
  //
  // Step A: For each category, find its dominant eff BPM (most cells there).
  // LN uses raw BPM (same as stream, no 2× multiplier).
  const jackEff = new Map<number, number>();
  const streamEff = new Map<number, number>();
  const lnEff = new Map<number, number>();
  const jackEntries: BPMKeyType[] = [];
  const streamEntries: BPMKeyType[] = [];
  const lnEntries: BPMKeyType[] = [];

  for (const bkt of bpmKeyTypes) {
    const cat = keyTypeToCategory(bkt.keyType);
    if (cat === "break") continue;
    const rawEff = cat === "jack" ? bkt.bpm * 2 : bkt.bpm;
    const effKey = Math.round(rawEff / 10) * 10;
    if (cat === "jack") {
      jackEff.set(effKey, (jackEff.get(effKey) ?? 0) + bkt.cellCount);
      jackEntries.push(bkt);
    } else if (cat === "ln") {
      lnEff.set(effKey, (lnEff.get(effKey) ?? 0) + bkt.cellCount);
      lnEntries.push(bkt);
    } else {
      streamEff.set(effKey, (streamEff.get(effKey) ?? 0) + bkt.cellCount);
      streamEntries.push(bkt);
    }
  }

  // Helper: find dominant eff BPM for a category
  function bestEff(m: Map<number, number>): { eff: number; cells: number } {
    let best = { eff: 0, cells: 0 };
    for (const [eff, cnt] of m) {
      if (cnt > best.cells) best = { eff, cells: cnt };
    }
    return best;
  }

  // Compare two categories: pick the harder/significant one
  // Threshold: harder category needs ≥50% of the easier's cells (not 30%)
  // to prevent a small hard section from overshadowing a dominant easier section.
  function pickWinner(a: { eff: number; cells: number }, b: { eff: number; cells: number }): "a" | "b" {
    if (a.cells === 0 && b.cells === 0) return "a";
    if (a.cells === 0) return "b";
    if (b.cells === 0) return "a";
    if (a.eff === b.eff) {
      // Same eff → more cells wins; if within 10%, prefer harder (jack > stream > ln)
      // which is "a" in the jack-vs-stream call order.
      const diff = Math.abs(a.cells - b.cells) / Math.max(a.cells, b.cells);
      if (diff < 0.10) return "a";
      return a.cells >= b.cells ? "a" : "b";
    }
    if (a.eff > b.eff) return a.cells >= b.cells * 0.5 ? "a" : "b";
    return b.cells >= a.cells * 0.5 ? "b" : "a";
  }

  const jackBest = bestEff(jackEff);
  const streamBest = bestEff(streamEff);
  const lnBest = bestEff(lnEff);

  // Three-way elimination: jack vs stream → winner, then vs ln
  // pickWinner returns "a" (first arg) or "b" (second arg)
  const jsWinner = pickWinner(jackBest, streamBest);
  const jsBest = jsWinner === "a" ? jackBest : streamBest;
  const jsName: CellCategory = jsWinner === "a" ? "jack" : "stream";
  const lnWinner = pickWinner(jsBest, lnBest);
  let mainCategory: CellCategory;
  let candidates: BPMKeyType[];
  if (lnWinner === "b") {
    // ln won
    mainCategory = "ln";
    candidates = lnEntries;
  } else {
    // js (jack or stream) won
    mainCategory = jsName;
    candidates = jsName === "jack" ? jackEntries : streamEntries;
  }

  // Step D: Difficulty weighting — when the same key type appears at
  //         multiple BPMs (e.g. 90 jack + 180 jack, or 175 stream + 263 stream),
  //         prefer the harder (higher BPM) variant if it has ≥ 30% share
  //         AND is at least 1.4× faster than the next slower variant.
  const byType = new Map<string, BPMKeyType[]>();
  for (const c of candidates) {
    const arr = byType.get(c.keyType) ?? [];
    arr.push(c);
    byType.set(c.keyType, arr);
  }
  const finalList: BPMKeyType[] = [];
  for (const [, entries] of byType) {
    if (entries.length <= 1) {
      finalList.push(entries[0]!);
      continue;
    }
    // Sort by BPM descending (hardest first)
    entries.sort((a, b) => b.bpm - a.bpm);
    const total = entries.reduce((s, e) => s + e.cellCount, 0);
    const hardest = entries[0]!;
    if (hardest.bpm >= entries[1]!.bpm * 1.4 && hardest.cellCount / total >= 0.30) {
      finalList.push(hardest);
    } else {
      // Keep the variant with most cells
      entries.sort((a, b) => b.cellCount - a.cellCount);
      finalList.push(entries[0]!);
    }
  }
  finalList.sort((a, b) => b.cellCount - a.cellCount);

  // Close-call rule: when top two entries have cell counts within 10%,
  // prefer the harder (higher density) key type.
  // This prevents a 50/50 split from defaulting to the easier type.
  const KEY_RANK: Record<string, number> = {
    "Full Handstream": 12, "Full Jumpstream": 11,
    "High Handstream": 10, "High Jumpstream": 9,
    "Mid Handstream": 8, "Mid Jumpstream": 7,
    "Low Handstream": 6, "Low Jumpstream": 5,
    "Speedy Tech": 9, "Jacky Tech": 7,
    "High Stream": 4,
    "Single Stream": 3, "Rolls": 2, "Minitrills": 2,
  };
  if (finalList.length >= 2) {
    const top = finalList[0]!, second = finalList[1]!;
    const maxC = Math.max(top.cellCount, second.cellCount);
    if (maxC > 0 && Math.abs(top.cellCount - second.cellCount) / maxC < 0.10) {
      const rT = KEY_RANK[top.keyType] ?? 0;
      const rS = KEY_RANK[second.keyType] ?? 0;
      if (rS > rT) {
        finalList[0] = second; // harder type wins
        finalList[1] = top;
      }
    }
  }

  const mainKeyType = finalList.length > 0
    ? finalList[0]!
    : (bpmKeyTypes.length > 0 ? bpmKeyTypes[0]! : { keyType: "Unknown", bpm: firstBPM, cellCount: 0, percentage: 100 });

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

  // Grid-based switch: max jack↔stream transitions in a 4-cell (16-row) window.
  // 4 cells = 16 rows → 15 adjacent row pairs (including cross-cell boundaries).
  // For each row pair: jack = same column active in both rows.
  let gridSwitch = 0;
  // Collect all rows' active columns across all stream cells
  const allRowCols: Set<number>[] = [];
  for (const cell of cells) {
    if (cell.category === "break" || cell.category === "ln") continue;
    const bpm = cell.effectiveBPM > 0 ? cell.effectiveBPM : 120;
    const rowDur = 60000 / bpm / 4;
    for (let r = 0; r < 4; r++) {
      const rs = cell.startTime + r * rowDur;
      const cols = new Set<number>();
      for (const n of getNotesInRange(beatmap, rs, rs + rowDur)) cols.add(n.col);
      allRowCols.push(cols);
    }
  }
  // Build pair types (jack/stream) for ALL consecutive row pairs
  const pairTypes: ("jack" | "stream")[] = [];
  for (let i = 0; i < allRowCols.length - 1; i++) {
    const overlap = [...allRowCols[i]!].some((c) => allRowCols[i + 1]!.has(c));
    pairTypes.push(overlap ? "jack" : "stream");
  }
  // Slide 15-pair window (= 16 rows = 4 cells)
  const WINDOW_PAIRS = 15;
  if (pairTypes.length >= WINDOW_PAIRS) {
    for (let i = 0; i <= pairTypes.length - WINDOW_PAIRS; i++) {
      let sw = 0;
      for (let j = i + 1; j < i + WINDOW_PAIRS; j++) {
        if (pairTypes[j] !== pairTypes[j - 1]) sw++;
      }
      if (sw > gridSwitch) gridSwitch = sw;
    }
  }

  return { cells, segments, bpmKeyTypes, mainKeyType, bpmRange, streamBreakdown, gridSwitch };
}

// Re-export colors for display
export { LN_TYPE_COLORS };
export { getNotesInRange };

/**
 * Map a key type string to its parent cell category.
 */
function keyTypeToCategory(keyType: string): CellCategory {
  const JACK_TYPES = new Set(["Minijack", "High Chordjack", "Jacky Tech"]);
  const LN_TYPES = new Set(["LN Inverse", "LN Unknown", "Ouroboros"]);
  if (JACK_TYPES.has(keyType)) return "jack";
  if (LN_TYPES.has(keyType)) return "ln";
  return "stream";
}
