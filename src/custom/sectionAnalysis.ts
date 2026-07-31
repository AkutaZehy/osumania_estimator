// ============================================================
// Section Analysis — Segment-based pattern analysis
// ============================================================
// Divides beatmap into segments and analyzes each segment's
// pattern type, LN subtypes, anomalies, and anchor info.
// Matches the prototype/section-bar.html detection algorithms.
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import { getNotesInRange, lowerBound } from "../utils/beatmapUtils.js";
import type { SunnyResult } from "../types/algorithm.js";
import type { PatternSummary } from "../types/patterns.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** LN subtypes with thresholds */
export const LN_SUBTYPES = {
  reverse: { name: "LN Inverse", threshold: { inverse: 20 } },
  releasehell: { name: "Timing Hell", threshold: { overlay: 30, ar: 20 } },
  density: { name: "Density", threshold: { tapLN: 40 } },
  ouroboros: { name: "Ouroboros", threshold: { ouroboros: 30 } },
  tree: { name: "LN Tree", threshold: { tree: 1 } },
  speedywc: { name: "Speedy WC", threshold: { speedyWC: 50 } },
  jackywc: { name: "Jacky WC", threshold: { jackyWC: 20 } },
  unknown: { name: "Unknown", threshold: {} },
} as const;

/** Segment pattern category */
export type SegmentCategory = "stream" | "jack" | "ln" | "tech" | "break";

/** Segment pattern sub-type */
export type SegmentSubType =
  | "single"
  | "js"
  | "hs"
  | "brokenjs"
  | "bulk"
  | "cj-low"
  | "cj-high"
  | "minijack"
  | "ln"
  | "speedy"
  | "jacky"
  | "break";

/** Anomaly type */
export type AnomalyType = "grace" | "broken" | "mixed";

/** LN metrics for a segment */
export interface SegmentLNMetrics {
  inverse: number;
  overlay: number;
  ar: number;
  tapLN: number;
  ouroboros: number;
  tree: number;
  speedyWC: number;
  jackyWC: number;
}

/** Tech direction data */
export interface TechDirectionData {
  directions: string[];
  turns: number[];
  divisions: string;
}

/** Single measure analysis result */
export interface Measure {
  /** Start time in ms */
  startTime: number;
  /** End time in ms */
  endTime: number;
  /** 0-based measure index */
  index: number;
  /** BPM for this measure */
  bpm: number;
  /** Pattern category */
  category: SegmentCategory;
  /** Pattern sub-type */
  subType: SegmentSubType;
  /** Per-beat structure pattern (e.g., [3,1,2,1] for CJ) */
  structure: number[] | null;
  /** N value for bulk streams (median notes per beat) */
  n: number | null;
  /** Anchors detected in this measure */
  anchors: number[];
  /** Anomalies detected */
  anomalies: AnomalyType[];
  /** LN metrics (only for LN measures) */
  lnMetrics: SegmentLNMetrics | null;
  /** LN subtype triggered (only for LN measures) */
  lnSubtype: string | null;
  /** Notes in this measure */
  noteCount: number;
  /** Tech direction data (only for speedy tech) */
  techData: TechDirectionData | null;
}

/** Single segment (contiguous measures of same category) */
export interface Segment {
  /** Start measure index (0-based) */
  startMeasure: number;
  /** End measure index (0-based, exclusive) */
  endMeasure: number;
  /** Start time in ms */
  startTime: number;
  /** End time in ms */
  endTime: number;
  /** BPM */
  bpm: number;
  /** Pattern category */
  category: SegmentCategory;
  /** Resolved sub-type for the segment */
  subType: SegmentSubType;
  /** Measures in this segment */
  measures: Measure[];
  /** Pattern description (full name) */
  patternStr: string;
  /** Anchor summary */
  anchorStr: string;
  /** Anomaly summary */
  anomalyStr: string;
  /** Triggered LN subtypes with values */
  triggeredLNTypes: Array<{ key: string; name: string; value: string }>;
  /** Tech sub-type resolved */
  techSubType: "speedy" | "jacky" | null;
}

/** Complete section analysis result */
export interface SectionAnalysis {
  measures: Measure[];
  segments: Segment[];
  totalDuration: number;
  totalMeasures: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function computeBPM(beatmap: ParsedBeatmap): number {
  const uninherited = beatmap.timingPoints.find((tp) => tp.uninherited);
  if (uninherited && uninherited.beatLength > 0) {
    // Round to avoid floating-point noise like 170.00000000000001
    return Math.round(60000 / uninherited.beatLength * 100) / 100;
  }
  return 120;
}

function getBeatLength(beatmap: ParsedBeatmap): number {
  const bpm = computeBPM(beatmap);
  return 60000 / bpm;
}

/**
 * Get notes in a time range.
 * Returns start times, columns, and LN flags for all notes in [startTime, endTime).
 */
/**
 * Compute per-beat note count structure for a measure.
 * Groups notes by beat boundary and returns an array of note counts per beat.
 * E.g., [3,1,2,1] means beat 1 has 3 notes, beat 2 has 1, etc.
 *
 * Uses floor with epsilon to handle floating-point precision.
 * A note at time T is assigned to beat floor((T - measureStart) / beatLength).
 * Epsilon prevents notes exactly on boundary from being misassigned.
 */
/**
 * Compute per-beat note count AND column occupancy for a measure.
 * Returns structure (counts per beat) and occupancy (columns per beat).
 */
function computeBeatStructure(
  notes: Array<{ col: number; start: number; end: number; isLN: boolean }>,
  measureStart: number,
  beatLength: number,
): { structure: number[]; occupancy: Array<Set<number>> } {
  const structure = [0, 0, 0, 0];
  const occupancy: Array<Set<number>> = [new Set(), new Set(), new Set(), new Set()];
  for (const note of notes) {
    const relTime = note.start - measureStart;
    const rawBeat = relTime / beatLength;
    const beatIdx = Math.min(3, Math.max(0, Math.floor(rawBeat + 0.001)));
    structure[beatIdx]++;
    occupancy[beatIdx].add(note.col);
  }
  return { structure, occupancy };
}

/**
 * Detect minijacks: same column on 2+ consecutive beat rows, BUT only if
 * no other column's note appears between the two rows.
 *
 * "连续的两行" = consecutive beat rows at 1/n resolution.
 * If a note from another column exists at 1/2n resolution between them,
 * the jack is broken → not a minijack.
 *
 * Implementation: for each pair of same-column notes on consecutive beats,
 * check if any other-column note exists in the time interval between them.
 */
function detectMinijacks(
  notes: Array<{ col: number; start: number }>,
  beatOccupancy: Array<Set<number>>,
  beatLength: number,
  measureStart: number,
): Map<number, number> {
  const colMax = new Map<number, number>();
  const numCols = 4;

  // For each column, find all notes sorted by time
  const colNotes: Array<Array<{ time: number; beatIdx: number }>> = Array.from({ length: numCols }, () => []);
  for (const note of notes) {
    const relTime = note.start - measureStart;
    const rawBeat = relTime / beatLength;
    const beatIdx = Math.min(3, Math.max(0, Math.floor(rawBeat + 0.001)));
    colNotes[note.col]!.push({ time: note.start, beatIdx });
  }

  // Sort each column's notes by time
  for (const cn of colNotes) cn.sort((a, b) => a.time - b.time);

  // For each column, find consecutive-beat pairs and check for interruptions
  for (let col = 0; col < numCols; col++) {
    let streak = 0;
    let maxStreak = 0;

    // Walk through this column's notes
    for (let i = 0; i < colNotes[col]!.length; i++) {
      const curr = colNotes[col]![i]!;
      const prev = i > 0 ? colNotes[col]![i - 1]! : null;

      if (prev && curr.beatIdx === prev.beatIdx + 1) {
        // Same column on consecutive beats — check for interruption
        const hasInterruption = notes.some(
          (n) =>
            n.col !== col &&
            n.start > prev.time &&
            n.start < curr.time,
        );

        if (!hasInterruption) {
          // No interruption → minijack continues
          streak++;
          maxStreak = Math.max(maxStreak, streak);
        } else {
          // Interruption → jack broken
          streak = 0;
        }
      } else if (prev && curr.beatIdx > prev.beatIdx + 1) {
        // Same column but not consecutive beats → reset streak
        streak = 0;
      } else if (!prev || curr.beatIdx !== prev.beatIdx) {
        // First note or different beat → start new streak
        streak = 1;
        maxStreak = Math.max(maxStreak, streak);
      }
    }

    // Minijack: 2+ consecutive beats without interruption
    if (maxStreak >= 2) {
      colMax.set(col, maxStreak);
    }
  }

  return colMax;
}

/**
 * Legacy anchor detection (used for segment-level stats).
 * Anchor = 3+ consecutive notes on the same column, gap <= 2x beat length.
 */
function detectAnchors(
  notes: Array<{ col: number; start: number; end: number; isLN: boolean }>,
  beatLength: number,
): number[] {
  if (notes.length === 0) return [];

  const colNotes = new Map<number, number[]>();
  for (const note of notes) {
    const existing = colNotes.get(note.col) ?? [];
    existing.push(note.start);
    colNotes.set(note.col, existing);
  }

  const anchors: number[] = [];
  const maxGap = beatLength * 2;

  for (const times of colNotes.values()) {
    times.sort((a, b) => a - b);
    let count = 1;
    for (let i = 1; i < times.length; i++) {
      const gap = times[i]! - times[i - 1]!;
      if (gap <= maxGap) {
        count++;
      } else {
        if (count >= 3) anchors.push(count);
        count = 1;
      }
    }
    if (count >= 3) anchors.push(count);
  }

  return anchors;
}

/**
 * Detect anomalies in a measure.
 */
function detectAnomalies(
  notes: Array<{ col: number; start: number; end: number; isLN: boolean }>,
  beatLength: number,
): AnomalyType[] {
  const anomalies: AnomalyType[] = [];

  // Grace: adjacent notes < 50ms apart on different columns
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i]!.start - notes[i - 1]!.end;
    if (gap > 0 && gap < 50 && notes[i]!.col !== notes[i - 1]!.col) {
      anomalies.push("grace");
      break;
    }
  }

  // Broken: density spike in 2-beat window > 12 notes
  const windowSize = beatLength * 2;
  for (let i = 0; i < notes.length; i++) {
    const windowStart = notes[i]!.start;
    const windowEnd = windowStart + windowSize;
    let count = 0;
    for (const note of notes) {
      if (note.start >= windowStart && note.start < windowEnd) {
        count++;
      }
    }
    if (count > 12) {
      anomalies.push("broken");
      break;
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Strict Ouroboros & Tree helpers (v3.1.0)
// ---------------------------------------------------------------------------

type LNNote = { col: number; start: number; end: number };

interface LNEdge { from: LNNote; to: LNNote }

function buildEdges(lns: LNNote[]): LNEdge[] {
  if (lns.length < 2) return [];
  // Sort by start time for binary search (O(k log k) instead of O(k²))
  const sorted = [...lns].sort((a, b) => a.start - b.start);
  const starts = sorted.map(l => l.start);
  const edges: LNEdge[] = [];
  for (const ln of lns) {
    const lo = lowerBound(starts, ln.end);
    const hi = lowerBound(starts, ln.end + 21);
    for (let i = lo; i < hi; i++) {
      const target = sorted[i]!;
      if (target !== ln) edges.push({ from: ln, to: target });
    }
  }
  return edges;
}

function maxBipartiteMatch(n: number, adj: number[][]): number[] {
  const matchR = new Array(n).fill(-1);
  const dfs = (u: number, visited: boolean[]): boolean => {
    for (const v of adj[u]!) {
      if (visited[v]) continue;
      visited[v] = true;
      if (matchR[v] === -1 || dfs(matchR[v]!, visited)) { matchR[v] = u; return true; }
    }
    return false;
  };
  for (let u = 0; u < n; u++) { const visited = new Array(n).fill(false); dfs(u, visited); }
  return matchR;
}

/**
 * Strict Ouroboros on a single measure window.
 * Returns 100 if the window's LNs form vertex-disjoint chains (path cover) with
 * no orphan LNs, after exempting "base" LNs (long orphans covering the window).
 * Returns 0 otherwise (shared paths / tree / orphan structure).
 */
function computeStrictOuroboros(lns: LNNote[], windowMs: number): number {
  if (lns.length < 2) return 0;
  const edges = buildEdges(lns);
  const inn = new Set<LNNote>(); const outn = new Set<LNNote>();
  for (const e of edges) { inn.add(e.to); outn.add(e.from); }
  // Exempt long base LNs: orphans covering ≥75% of the window don't break chains
  const exempt = new Set(lns.filter(l => !inn.has(l) && !outn.has(l) && (l.end - l.start) >= windowMs * 0.75));
  const active = lns.filter(l => !exempt.has(l));
  if (active.length < 2) return 0;
  const idx = new Map<LNNote, number>(); active.forEach((l, i) => idx.set(l, i));
  const aEdges = edges.filter(e => idx.has(e.from) && idx.has(e.to));
  const aIn = new Set<LNNote>(); const aOut = new Set<LNNote>();
  for (const e of aEdges) { aIn.add(e.to); aOut.add(e.from); }
  if (active.some(l => !aIn.has(l) && !aOut.has(l))) return 0;
  const outAdj: number[][] = Array.from({ length: active.length }, () => []);
  for (const e of aEdges) outAdj[idx.get(e.from)!]!.push(idx.get(e.to)!);
  const matchR = maxBipartiteMatch(active.length, outAdj);
  const ho = new Array(active.length).fill(false), hi = new Array(active.length).fill(false);
  for (let v = 0; v < active.length; v++) if (matchR[v] !== -1) { ho[matchR[v]!] = true; hi[v] = true; }
  let covered = 0;
  for (let i = 0; i < active.length; i++) if (ho[i] || hi[i]) covered++;
  return covered === active.length ? 100 : 0;
}

// ---------------------------------------------------------------------------
// LN Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze LN metrics for a set of notes.
 */
function analyzeLNMetrics(
  notes: Array<{ col: number; start: number; end: number; isLN: boolean }>,
  beatLength: number,
): SegmentLNMetrics {
  const lns = notes.filter((n) => n.isLN);
  const ZERO = { inverse: 0, overlay: 0, ar: 0, tapLN: 0, ouroboros: 0, tree: 0, speedyWC: 0, jackyWC: 0 };
  if (lns.length === 0) return ZERO;

  // Tap LN: duration <= beatLength/4
  const maxTapLN = beatLength / 4;
  const tapLNCount = lns.filter((ln) => ln.end - ln.start <= maxTapLN).length;
  const tapLN = lns.length > 0 ? (tapLNCount / lns.length) * 100 : 0;

  // Inverse: genuine H-T-H-T alternation between two columns.
  // Requirements:
  //   1. LNs must be longer than beatLength/8 (filter ultra-short/tap LNs)
  //   2. ≥3 cross-column T→H alignments between the column pair
  //   3. Same-column start gaps must be consistent (≥65% within ±40% of median)
  const invMinDur = beatLength / 8;
  const invGapTol = 0.40; // relative tolerance for same-column gap consistency
  const nonTapLNs = lns.filter(ln => ln.end - ln.start > invMinDur);
  let inverseCount = 0;
  for (let colA = 0; colA < 4; colA++) {
    for (let colB = colA + 1; colB < 4; colB++) {
      const aLNs = nonTapLNs.filter(ln => ln.col === colA).sort((a, b) => a.start - b.start);
      const bLNs = nonTapLNs.filter(ln => ln.col === colB).sort((a, b) => a.start - b.start);
      if (aLNs.length < 2 || bLNs.length < 2) continue;

      // Check same-column gap consistency on EACH column
      const consistentColumn = (colLNs: typeof aLNs): boolean => {
        if (colLNs.length < 2) return false;
        const gaps = colLNs.slice(1).map((ln, i) => ln.start - colLNs[i]!.start);
        const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
        if (med <= 0) return false;
        const consistent = gaps.filter(g => Math.abs(g - med) / med < invGapTol);
        // For 2 LNs (1 gap): all gaps must be consistent
        // For 3+ LNs: ≥65% of gaps must be consistent
        return gaps.length === 1 ? consistent.length === 1 : consistent.length >= gaps.length * 0.65;
      };
      if (!consistentColumn(aLNs) || !consistentColumn(bLNs)) continue;

      // Count T→H alignments: A.tail → B.head (no RC between them)
      let aligned = 0;
      const usedB = new Set<number>();
      for (const a of aLNs) {
        for (let bi = 0; bi < bLNs.length; bi++) {
          if (usedB.has(bi)) continue;
          if (Math.abs(a.end - bLNs[bi]!.start) < 21) {
            const hasRC = notes.some(n => !n.isLN && n.start >= a.end && n.start <= bLNs[bi]!.start);
            if (!hasRC) { aligned++; usedB.add(bi); break; }
          }
        }
      }
      // Count reverse: B.tail → A.head
      const usedA = new Set<number>();
      for (let ai = 0; ai < aLNs.length; ai++) {
        for (const b of bLNs) {
          if (usedA.has(ai)) continue;
          if (Math.abs(b.end - aLNs[ai]!.start) < 21) {
            const hasRC = notes.some(n => !n.isLN && n.start >= b.end && n.start <= aLNs[ai]!.start);
            if (!hasRC) { aligned++; usedA.add(ai); break; }
          }
        }
      }
      if (aligned < 3) continue;

      const invLNs = new Set([...aLNs, ...bLNs]);
      inverseCount += invLNs.size;
    }
  }
  const inverse = nonTapLNs.length > 0 ? Math.min(100, (inverseCount / nonTapLNs.length) * 100) : 0;

  // Overlay: strict forward overlap (a.start < b.start && a.end > b.start) — O(k log k)
  let overlayCount = 0;
  if (lns.length >= 2) {
    const sorted = [...lns].sort((a, b) => a.start - b.start);
    const starts = sorted.map(l => l.start);
    // nextDistinct[i]: first index whose start is strictly greater than sorted[i].start
    // (excludes same-start chords, which are not overlays)
    const nextDistinct = new Array<number>(sorted.length);
    let k = sorted.length;
    for (let i = sorted.length - 1; i >= 0; i--) {
      nextDistinct[i] = k;
      if (i === 0 || starts[i - 1] !== starts[i]) k = i;
    }
    for (let i = 0; i < sorted.length; i++) {
      const hi = lowerBound(starts, sorted[i]!.end);
      overlayCount += Math.max(0, hi - nextDistinct[i]!);
    }
  }
  const overlay = lns.length > 0 ? (overlayCount / lns.length) * 100 : 0;

  // A/R: Attack/Release pairs — O(k) via end-time grouping
  let arCount = 0;
  if (lns.length >= 2) {
    const byEnd = new Map<number, typeof lns>();
    for (const ln of lns) {
      const g = byEnd.get(ln.end) ?? [];
      g.push(ln);
      byEnd.set(ln.end, g);
    }
    for (const [, group] of byEnd) {
      const total = group.length;
      if (total < 2) continue;
      const startCount = new Map<number, number>();
      for (const ln of group) startCount.set(ln.start, (startCount.get(ln.start) ?? 0) + 1);
      let sameStartPairs = 0;
      for (const c of startCount.values()) sameStartPairs += (c * (c - 1)) / 2;
      arCount += (total * (total - 1)) / 2 - sameStartPairs;
    }
  }
  const ar = lns.length > 0 ? (arCount / lns.length) * 100 : 0;

  // Ouroboros: strict path-cover on this measure window (v3.1.0)
  const lnsOnly: LNNote[] = lns.map(n => ({ col: n.col, start: n.start, end: n.end }));
  const ouroboros = computeStrictOuroboros(lnsOnly, beatLength * 4);

  // Tree: all LNs participate in T→H edges but NOT strict ouroboros
  let tree = 0;
  if (ouroboros < 30) {
    const tEdges = buildEdges(lns.map(n => ({ col: n.col, start: n.start, end: n.end })));
    if (tEdges.length > 0) {
      const connected = new Set<LNNote>();
      for (const e of tEdges) { connected.add(e.from); connected.add(e.to); }
      if (connected.size === lns.length) tree = 100;
    }
  }

  // Speedy WC / Jacky WC: directional/same-column row analysis — O(m log m)
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);
  const rows: Array<{ time: number; cols: number[] }> = [];
  for (const n of sortedNotes) {
    if (rows.length > 0 && n.start - rows[rows.length - 1]!.time <= 5) {
      const last = rows[rows.length - 1]!;
      if (!last.cols.includes(n.col)) last.cols.push(n.col);
    } else {
      rows.push({ time: n.start, cols: [n.col] });
    }
  }
  const sortedRows = rows.map(r => [r.time, r.cols] as [number, number[]]);
  let speedy = 0, jacky = 0;
  for (let i = 1; i < sortedRows.length; i++) {
    const prev = sortedRows[i - 1]![1], curr = sortedRows[i]![1];
    if (curr.some(c => prev.includes(c))) jacky++;
    const pMin = Math.min(...prev), pMax = Math.max(...prev);
    const cMin = Math.min(...curr), cMax = Math.max(...curr);
    if (cMax < pMin || cMin > pMax) speedy++;
  }
  const rowCount = Math.max(1, sortedRows.length - 1);
  // Speedy requires at least 8th-note density (≥2 rows/beat).
  // Slower alternating patterns (quarter-note/half-BPM) aren't "speedy."
  const rowsPerBeat = sortedRows.length / 4;
  const speedyWC = rowsPerBeat >= 2 ? (speedy / rowCount) * 100 : 0;
  const jackyWC = (jacky / rowCount) * 100;

  return { inverse, overlay, ar, tapLN, ouroboros, tree, speedyWC, jackyWC };
}

/**
 * Determine LN subtype based on metrics (first match wins).
 * Priority: Ouroboros → Inverse → Tree → Timing Hell → Density → Speedy WC → Jacky WC
 */
function determineLNSubtype(metrics: SegmentLNMetrics): string {
  if (metrics.ouroboros >= LN_SUBTYPES.ouroboros.threshold.ouroboros!) {
    return LN_SUBTYPES.ouroboros.name;
  }
  if (metrics.inverse >= LN_SUBTYPES.reverse.threshold.inverse) {
    return LN_SUBTYPES.reverse.name;
  }
  if (metrics.tree >= LN_SUBTYPES.tree.threshold.tree!) {
    return LN_SUBTYPES.tree.name;
  }
  if (
    metrics.overlay >= LN_SUBTYPES.releasehell.threshold.overlay! &&
    metrics.ar >= LN_SUBTYPES.releasehell.threshold.ar!
  ) {
    return LN_SUBTYPES.releasehell.name;
  }
  if (metrics.tapLN >= LN_SUBTYPES.density.threshold.tapLN!) {
    return LN_SUBTYPES.density.name;
  }
  if (metrics.speedyWC >= LN_SUBTYPES.speedywc.threshold.speedyWC!) {
    return LN_SUBTYPES.speedywc.name;
  }
  if (metrics.jackyWC >= LN_SUBTYPES.jackywc.threshold.jackyWC!) {
    return LN_SUBTYPES.jackywc.name;
  }
  return LN_SUBTYPES.unknown.name;
}

/**
 * Determine triggered LN subtypes with their metric values.
 */
function determineTriggeredLNTypes(
  metrics: SegmentLNMetrics,
): Array<{ key: string; name: string; value: string }> {
  const triggered: Array<{ key: string; name: string; value: string }> = [];
  if (metrics.inverse >= LN_SUBTYPES.reverse.threshold.inverse) {
    triggered.push({
      key: "reverse",
      name: LN_SUBTYPES.reverse.name,
      value: `${Math.round(metrics.inverse)}%`,
    });
  }
  if (
    metrics.overlay >= LN_SUBTYPES.releasehell.threshold.overlay! &&
    metrics.ar >= LN_SUBTYPES.releasehell.threshold.ar!
  ) {
    triggered.push({
      key: "releasehell",
      name: LN_SUBTYPES.releasehell.name,
      value: `Ov${Math.round(metrics.overlay)}/AR${Math.round(metrics.ar)}`,
    });
  }
  if (metrics.tapLN >= LN_SUBTYPES.density.threshold.tapLN!) {
    triggered.push({
      key: "density",
      name: LN_SUBTYPES.density.name,
      value: `Tap${Math.round(metrics.tapLN)}%`,
    });
  }
  if (metrics.ouroboros >= LN_SUBTYPES.ouroboros.threshold.ouroboros!) {
    triggered.push({
      key: "ouroboros",
      name: LN_SUBTYPES.ouroboros.name,
      value: `${Math.round(metrics.ouroboros)}%`,
    });
  }
  if (metrics.tree >= LN_SUBTYPES.tree.threshold.tree!) {
    triggered.push({
      key: "tree",
      name: LN_SUBTYPES.tree.name,
      value: "Tree",
    });
  }
  if (metrics.speedyWC >= LN_SUBTYPES.speedywc.threshold.speedyWC!) {
    triggered.push({
      key: "speedywc",
      name: LN_SUBTYPES.speedywc.name,
      value: `Sp${Math.round(metrics.speedyWC)}%`,
    });
  }
  if (metrics.jackyWC >= LN_SUBTYPES.jackywc.threshold.jackyWC!) {
    triggered.push({
      key: "jackywc",
      name: LN_SUBTYPES.jackywc.name,
      value: `Jk${Math.round(metrics.jackyWC)}%`,
    });
  }
  return triggered;
}

// ---------------------------------------------------------------------------
// Measure Classification
// ---------------------------------------------------------------------------

/**
 * Classify a single measure into category + subType.
 *
 * Decision tree (minijack-first):
 * 1. Break: no notes or very sparse (< 0.5 notes/beat)
 * 2. LN: LN ratio >= 50%
 * 3. Compute per-beat structure + column occupancy
 * 4. Detect minijacks: same column hit on 3+ consecutive beat rows
 * 5. Has minijack → Jack type:
 *    - maxBeat >= 3 → CJ (chord jack)
 *    - maxBeat <= 2 → MJ (mini jack)
 * 6. No minijack → Stream type:
 *    - maxBeat >= 3 → HS (hand stream)
 *    - maxBeat == 2 → JS (jump stream)
 *    - maxBeat == 1 → Single stream
 * 7. Has zeros in structure → BrokenJS (if JS-like) or Tech
 */
function classifyMeasure(
  notes: Array<{ col: number; start: number; end: number; isLN: boolean }>,
  measureStart: number,
  beatLength: number,
): {
  category: SegmentCategory;
  subType: SegmentSubType;
  structure: number[] | null;
  n: number | null;
} {
  const totalNotes = notes.length;

  // ---- Break ----
  if (totalNotes === 0) {
    return { category: "break", subType: "break", structure: null, n: null };
  }
  const notesPerBeat = totalNotes / 4;
  if (notesPerBeat < 0.5) {
    return { category: "break", subType: "break", structure: null, n: null };
  }

  // ---- LN ----
  const lnNotes = notes.filter((n) => n.isLN);
  const lnRatio = lnNotes.length / totalNotes;
  if (lnRatio >= 0.5) {
    return { category: "ln", subType: "ln", structure: null, n: null };
  }

  // ---- Compute structure + occupancy ----
  const { structure, occupancy } = computeBeatStructure(notes, measureStart, beatLength);
  const maxBeat = Math.max(...structure);
  const hasZeros = structure.includes(0);
  const allSame = new Set(structure).size === 1;

  // ---- Uniform patterns → Stream ----
  // Bulk: all beats have same count >= 2 → bulk stream
  if (allSame && maxBeat >= 2) {
    return { category: "stream", subType: "bulk", structure: null, n: maxBeat };
  }
  // Single: all beats have exactly 1 note
  if (allSame && maxBeat === 1) {
    return { category: "stream", subType: "single", structure, n: null };
  }

  // ---- Detect minijacks (2+ consecutive beats on same column, no interruption) ----
  // This is the SOLE criterion for jack vs stream.
  const minijacks = detectMinijacks(notes, occupancy, beatLength, measureStart);
  const hasMinijack = minijacks.size > 0;

  // ---- Has minijack → Jack type ----
  if (hasMinijack) {
    if (maxBeat >= 3) {
      // Split CJ into low/high by jack density (jacks count / total beats)
      // Low CJ = sparse jacks, easily misclassified as stream
      // High CJ = dense jacks, clearly jack pattern
      const jackDensity = minijacks.size / 4;  // 4 beats per measure
      if (jackDensity >= 0.5) {
        return { category: "jack", subType: "cj-high", structure, n: null };
      }
      return { category: "jack", subType: "cj-low", structure, n: null };
    }
    return { category: "jack", subType: "minijack", structure, n: null };
  }

  // ---- No minijack → Stream type ----
  if (maxBeat >= 3) {
    return { category: "stream", subType: "hs", structure, n: null };
  }
  if (maxBeat === 2) {
    return { category: "stream", subType: "js", structure, n: null };
  }

  // ---- Fallback: has zeros but no minijack ----
  if (hasZeros) {
    return { category: "stream", subType: "brokenjs", structure, n: null };
  }

  return { category: "stream", subType: "single", structure, n: null };
}

// ---------------------------------------------------------------------------
// Segment Detection (contiguous same-category measures)
// ---------------------------------------------------------------------------

/**
 * Detect broken JS in a segment of measures.
 * BrokenJS: has JS structure but with gaps (0s in structure), density 0.5-1.5 notes/beat.
 */
function isBrokenJS(measures: Measure[]): boolean {
  if (measures.length === 0) return false;
  const hasZero = measures.some((m) => m.structure && m.structure.includes(0));
  const totalNotes = measures.reduce((sum, m) => {
    if (m.structure) return sum + m.structure.reduce((a, b) => a + b, 0);
    return sum + m.noteCount;
  }, 0);
  const avgNotesPerBeat = totalNotes / (measures.length * 4);
  const isJS = measures.every(
    (m) => m.subType === "js" || m.subType === "brokenjs" || m.subType === "single",
  );
  return hasZero && avgNotesPerBeat >= 0.5 && avgNotesPerBeat <= 1.5 && isJS;
}

/**
 * Detect if a segment is a break (very sparse).
 */
function isBreak(measures: Measure[]): boolean {
  if (measures.length === 0) return false;
  if (measures.every((m) => m.category === "break")) return true;
  if (measures.some((m) => m.category === "tech" || m.category === "ln")) return false;
  const totalNotes = measures.reduce((sum, m) => sum + m.noteCount, 0);
  const avgNotesPerBeat = totalNotes / (measures.length * 4);
  return avgNotesPerBeat < 0.5;
}

/**
 * Detect tech sub-type in a segment.
 * Speedy: more speedy-tech measures
 * Jacky: more jacky-tech measures
 */
function detectTechSubType(
  measures: Measure[],
): "speedy" | "jacky" | null {
  const speedys = measures.filter((m) => m.subType === "speedy");
  const jackys = measures.filter((m) => m.subType === "jacky");
  if (speedys.length === 0 && jackys.length === 0) return null;
  return speedys.length >= jackys.length ? "speedy" : "jacky";
}

/**
 * Resolve the pattern description for a segment (full names).
 */
function resolvePatternStr(
  measures: Measure[],
  category: SegmentCategory,
): string {
  if (category === "break") {
    return "Break";
  }

  if (category === "stream") {
    if (isBreak(measures)) {
      return "Break";
    }
    if (isBrokenJS(measures)) {
      return "Broken Jump Stream";
    }
    const bulks = measures.filter((m) => m.subType === "bulk");
    const jss = measures.filter((m) => m.subType === "js");
    const hss = measures.filter((m) => m.subType === "hs");
    if (bulks.length > 0) {
      const ns = bulks.map((m) => m.n!).filter((n) => n != null);
      return `Stream 2+${median(ns)}`;
    }
    if (jss.length > hss.length) {
      return "Jump Stream";
    }
    if (hss.length > 0) {
      return "Hand Stream";
    }
    return "Single Stream";
  }

  if (category === "jack") {
    const cjs = measures.filter((m) => m.subType === "cj-low" || m.subType === "cj-high");
    return cjs.length > 0 ? "Chord Jack" : "Mini Jack";
  }

  if (category === "ln") {
    // Compute average LN metrics across segment
    const avgMetrics: SegmentLNMetrics = { inverse: 0, overlay: 0, ar: 0, tapLN: 0, ouroboros: 0, tree: 0, speedyWC: 0, jackyWC: 0 };
    let metricCount = 0;
    for (const mm of measures) {
      if (mm.lnMetrics) {
        avgMetrics.inverse += mm.lnMetrics.inverse;
        avgMetrics.overlay += mm.lnMetrics.overlay;
        avgMetrics.ar += mm.lnMetrics.ar;
        avgMetrics.tapLN += mm.lnMetrics.tapLN;
        avgMetrics.ouroboros += mm.lnMetrics.ouroboros;
        avgMetrics.tree += mm.lnMetrics.tree;
        avgMetrics.speedyWC += mm.lnMetrics.speedyWC;
        avgMetrics.jackyWC += mm.lnMetrics.jackyWC;
        metricCount++;
      }
    }
    if (metricCount > 0) {
      avgMetrics.inverse = Math.round(avgMetrics.inverse / metricCount);
      avgMetrics.overlay = Math.round(avgMetrics.overlay / metricCount);
      avgMetrics.ar = Math.round(avgMetrics.ar / metricCount);
      avgMetrics.tapLN = Math.round(avgMetrics.tapLN / metricCount);
      avgMetrics.ouroboros = Math.round(avgMetrics.ouroboros / metricCount);
      avgMetrics.tree = Math.round(avgMetrics.tree / metricCount);
      avgMetrics.speedyWC = Math.round(avgMetrics.speedyWC / metricCount);
      avgMetrics.jackyWC = Math.round(avgMetrics.jackyWC / metricCount);
    }

    const triggered = determineTriggeredLNTypes(avgMetrics);
    if (triggered.length > 0) {
      return triggered.map((t) => `${t.name} ${t.value}`).join(" ");
    }
    return "Unknown LN";
  }

  if (category === "tech") {
    const techSub = detectTechSubType(measures);
    return techSub === "speedy" ? "Speedy Tech" : "Jacky Tech";
  }

  return "-";
}

// ---------------------------------------------------------------------------
// Main Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze beatmap and return section analysis.
 *
 * @param beatmap         - Parsed beatmap data
 * @param _sunny          - Sunny Rework result (unused, for future integration)
 * @param _patterns       - Pattern summary (unused, for future integration)
 * @param measuresPerSeg  - Number of measures per segment for grouping (default: 4)
 * @returns Section analysis with per-measure and per-segment results
 */
export function analyzeSections(
  beatmap: ParsedBeatmap,
  signal?: AbortSignal,
  _sunny?: SunnyResult,
  _patterns?: PatternSummary,
  _measuresPerSeg: number = 4,
): SectionAnalysis {
  const bpm = computeBPM(beatmap);
  const beatLength = getBeatLength(beatmap);
  const measureLength = beatLength * 4; // 4 beats per measure
  const totalDuration = beatmap.duration;
  const totalMeasures = Math.ceil(totalDuration / measureLength);

  // ---- Phase 1: Classify each measure ----
  const measures: Measure[] = [];
  const _debugLines: string[] = [];

  for (let i = 0; i < totalMeasures; i++) {
    signal?.throwIfAborted(); // check cancellation every measure
    const mStart = beatmap.firstNote + i * measureLength;
    const mEnd = mStart + measureLength;

    const notes = getNotesInRange(beatmap, mStart, mEnd);
    const { category, subType, structure, n } = classifyMeasure(notes, mStart, beatLength);
    const anchors = detectAnchors(notes, beatLength);
    const anomalies = detectAnomalies(notes, beatLength);

    // Debug: log first 20 measures
    if (i < 20 && notes.length > 0) {
      _debugLines.push(
        `M${i + 1}: [${structure ?? "null"}] anchors=[${anchors}] notes=${notes.length} → ${category}/${subType}`,
      );
    }

    // LN analysis
    let lnMetrics: SegmentLNMetrics | null = null;
    let lnSubtype: string | null = null;
    if (category === "ln") {
      lnMetrics = analyzeLNMetrics(notes, beatLength);
      lnSubtype = determineLNSubtype(lnMetrics);
    }

    // Tech direction data (placeholder — would need roll/trill detection)
    const techData: TechDirectionData | null = null;

    measures.push({
      startTime: mStart,
      endTime: mEnd,
      index: i,
      bpm,
      category,
      subType,
      structure,
      n,
      anchors,
      anomalies,
      lnMetrics,
      lnSubtype,
      noteCount: notes.length,
      techData,
    });
  }

  // ---- Phase 2: Group contiguous same-category measures into segments ----
  const segments: Segment[] = [];
  let segStart = 0;

  for (let segEnd = 1; segEnd <= measures.length; segEnd++) {
    const isLast = segEnd >= measures.length;
    const categoryChanged = !isLast && measures[segEnd]!.category !== measures[segStart]!.category;

    if (isLast || categoryChanged) {
      const chunk = measures.slice(segStart, segEnd);
      const m0 = chunk[0]!;

      // Resolve segment properties
      const techSubType = detectTechSubType(chunk);
      const resolvedSubType: SegmentSubType =
        m0.category === "tech" && techSubType
          ? techSubType
          : isBreak(chunk)
            ? "break"
            : isBrokenJS(chunk)
              ? "brokenjs"
              : m0.subType;

      const allAnchors = chunk.flatMap((mm) => mm.anchors);
      const anchorStr =
        allAnchors.length > 0
          ? `max:${Math.max(...allAnchors)} med:${median(allAnchors)}`
          : "-";

      // Anomaly counts
      const anomCnt: Record<string, number> = { grace: 0, broken: 0, mixed: 0 };
      for (const mm of chunk) {
        for (const a of mm.anomalies) {
          anomCnt[a] = (anomCnt[a] || 0) + 1;
        }
      }
      const anomStr =
        Object.entries(anomCnt)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join(" ") || "-";

      // LN triggered types (for segment)
      let triggeredLNTypes: Array<{ key: string; name: string; value: string }> = [];
      if (m0.category === "ln") {
      const avgMetrics: SegmentLNMetrics = { inverse: 0, overlay: 0, ar: 0, tapLN: 0, ouroboros: 0, tree: 0, speedyWC: 0, jackyWC: 0 };
      let metricCount = 0;
      for (const mm of chunk) {
        if (mm.lnMetrics) {
          avgMetrics.inverse += mm.lnMetrics.inverse;
          avgMetrics.overlay += mm.lnMetrics.overlay;
          avgMetrics.ar += mm.lnMetrics.ar;
          avgMetrics.tapLN += mm.lnMetrics.tapLN;
          avgMetrics.ouroboros += mm.lnMetrics.ouroboros;
          avgMetrics.tree += mm.lnMetrics.tree;
          avgMetrics.speedyWC += mm.lnMetrics.speedyWC;
          avgMetrics.jackyWC += mm.lnMetrics.jackyWC;
          metricCount++;
        }
      }
      if (metricCount > 0) {
        avgMetrics.inverse = Math.round(avgMetrics.inverse / metricCount);
        avgMetrics.overlay = Math.round(avgMetrics.overlay / metricCount);
        avgMetrics.ar = Math.round(avgMetrics.ar / metricCount);
        avgMetrics.tapLN = Math.round(avgMetrics.tapLN / metricCount);
        avgMetrics.ouroboros = Math.round(avgMetrics.ouroboros / metricCount);
        avgMetrics.tree = Math.round(avgMetrics.tree / metricCount);
        avgMetrics.speedyWC = Math.round(avgMetrics.speedyWC / metricCount);
        avgMetrics.jackyWC = Math.round(avgMetrics.jackyWC / metricCount);
      }
        triggeredLNTypes = determineTriggeredLNTypes(avgMetrics);
      }

      const patternStr = resolvePatternStr(chunk, m0.category);

      segments.push({
        startMeasure: segStart,
        endMeasure: segEnd,
        startTime: m0.startTime,
        endTime: chunk[chunk.length - 1]!.endTime,
        bpm: m0.bpm,
        category: m0.category,
        subType: resolvedSubType,
        measures: chunk,
        patternStr,
        anchorStr,
        anomalyStr: anomStr,
        triggeredLNTypes,
        techSubType,
      });

      segStart = segEnd;
    }
  }

  return {
    measures,
    segments,
    totalDuration,
    totalMeasures,
  };
}
