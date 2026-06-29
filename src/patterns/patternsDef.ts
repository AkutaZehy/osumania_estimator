// ============================================================
// Pattern Definitions — core & specific pattern detectors
// Ported from osumania_map_analyser js/patterns/patternsDef.js
// ============================================================

import { CorePattern } from "../types/patterns.js";
import { Direction, type PrimitiveRow } from "../types/primitives.js";
import { PATTERNS_CONFIG } from "./config.js";
import { detectDirection } from "./primitives.js";

const {
  COORDINATION_SPECIFIC_ORDER,
  CORE_RATING_MULTIPLIER,
  DENSITY_SPECIFIC_ORDER,
  INVERSE_GAP_TOLERANCE_MS,
  INVERSE_MIN_FILLED_LANES,
  JACKY_CONTEXT_WINDOW,
  JACKY_FALLBACK_MAX_MSPB,
  JACKY_MIN_BPM,
  RELEASE_FULL_MATCH_ROWS,
  RELEASE_MIN_TAIL_ROWS,
  RELEASE_ROLL_POINTS,
  RELEASE_SCAN_ROWS,
  RC_LN_CORE_SCALE,
  RC_CORE_LN_SCALE,
  SHIELD_MAX_BEAT_RATIO,
  SUBTYPE_RATING_MULTIPLIER_BY_MODE,
  WILDCARD_SPECIFIC_ORDER,
} = PATTERNS_CONFIG;

export const CORE_PATTERN_LIST: CorePattern[] = [
  CorePattern.Stream,
  CorePattern.Chordstream,
  CorePattern.Jacks,
  CorePattern.Coordination,
  CorePattern.Density,
  CorePattern.Wildcard,
];

// ============================================================
// Rating helpers
// ============================================================

function ratingMultiplier(pattern: CorePattern): number {
  return CORE_RATING_MULTIPLIER[pattern] ?? 1.0;
}

export function resolveRatingMultiplier(
  pattern: CorePattern,
  specificType: string | null,
  modeTag = "Mix",
): number {
  const lnCorePatterns = new Set<CorePattern>([
    CorePattern.Coordination,
    CorePattern.Density,
    CorePattern.Wildcard,
  ]);
  const rcCorePatterns = new Set<CorePattern>([
    CorePattern.Stream,
    CorePattern.Chordstream,
    CorePattern.Jacks,
  ]);

  const defaultMultiplier = ratingMultiplier(pattern);

  const subtypeMap =
    SUBTYPE_RATING_MULTIPLIER_BY_MODE[modeTag] ??
    SUBTYPE_RATING_MULTIPLIER_BY_MODE.Mix ??
    {};

  let value =
    specificType == null
      ? defaultMultiplier
      : (subtypeMap[specificType] ?? defaultMultiplier);

  if (modeTag === "RC" && lnCorePatterns.has(pattern)) {
    const mixMap =
      SUBTYPE_RATING_MULTIPLIER_BY_MODE.Mix ?? {};
    const base =
      specificType == null
        ? defaultMultiplier
        : (mixMap[specificType] ?? defaultMultiplier);
    value = base * RC_LN_CORE_SCALE;
  }

  if (modeTag === "LN" && rcCorePatterns.has(pattern)) {
    value *= RC_CORE_LN_SCALE;
  }

  return value;
}

// ============================================================
// Reorder helpers
// ============================================================

export type SpecificEntry = [string, (xs: PrimitiveRow[]) => number];

function reorderSpecific(
  items: SpecificEntry[],
  preferredOrder: readonly string[],
): SpecificEntry[] {
  if (items.length <= 1 || preferredOrder.length === 0) return items;
  const orderRank = new Map(preferredOrder.map((name, idx) => [name, idx]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ar = orderRank.has(a.item[0])
        ? orderRank.get(a.item[0])!
        : orderRank.size;
      const br = orderRank.has(b.item[0])
        ? orderRank.get(b.item[0])!
        : orderRank.size;
      if (ar !== br) return ar - br;
      return a.index - b.index;
    })
    .map((x) => x.item);
}

// ============================================================
// Head-point row helpers
// ============================================================

interface HeadPointRow {
  index: number;
  time: number;
  msPerBeat: number;
  beatLength: number;
  notes: number;
  jacks: number;
  direction: Direction;
  roll: boolean;
  keys: number;
  leftHandKeys: number;
  lnHeads: number[];
  lnBodies: number[];
  lnTails: number[];
  normalNotes: number[];
  rawNotes: number[];
}

function detectDirectionFromCols(
  prevCols: number[],
  currCols: number[],
): [Direction, boolean] {
  if (!prevCols.length || !currCols.length) return [Direction.NONE, false];
  const prevLeftmost = prevCols[0]!;
  const prevRightmost = prevCols[prevCols.length - 1]!;
  const currLeftmost = currCols[0]!;
  const currRightmost = currCols[currCols.length - 1]!;
  const direction = detectDirection(
    prevLeftmost,
    prevRightmost,
    currLeftmost,
    currRightmost,
  );
  const roll =
    prevLeftmost > currRightmost || prevRightmost < currLeftmost;
  return [direction, roll];
}

function asHeadPointRow(
  row: PrimitiveRow,
  previousHeadCols: number[],
): HeadPointRow {
  const headCols = row.lnHeads;
  const jacks = headCols.length
    ? headCols.filter((c) => previousHeadCols.includes(c)).length
    : 0;

  let direction = Direction.NONE;
  let roll = false;
  if (previousHeadCols.length && headCols.length) {
    [direction, roll] = detectDirectionFromCols(previousHeadCols, headCols);
  }

  return {
    index: row.index,
    time: row.time,
    msPerBeat: row.msPerBeat,
    beatLength: row.beatLength,
    notes: headCols.length,
    jacks,
    direction,
    roll,
    keys: row.keys,
    leftHandKeys: row.leftHandKeys,
    lnHeads: row.lnHeads,
    lnBodies: row.lnBodies,
    lnTails: row.lnTails,
    normalNotes: [],
    rawNotes: headCols,
  };
}

function headRows(
  xs: PrimitiveRow[],
  n: number,
): HeadPointRow[] {
  const rows: HeadPointRow[] = [];
  let prev: number[] = [];
  for (const row of xs.slice(0, n)) {
    const hr = asHeadPointRow(row, prev);
    rows.push(hr);
    if (hr.rawNotes.length) prev = hr.rawNotes;
  }
  return rows;
}

// ============================================================
// LN context helpers
// ============================================================

function isSameHandAdjacent(
  colA: number,
  colB: number,
  split: number,
): boolean {
  if (Math.abs(colA - colB) !== 1) return false;
  return (colA < split) === (colB < split);
}

export function jackBpm(deltaMs: number): number {
  if (deltaMs <= 0) return 230;
  return Math.min(15000 / deltaMs, 230);
}

export function isLnHeadContext(xs: PrimitiveRow[]): boolean {
  return xs.length > 0 && xs[0]!.lnHeads.length > 0;
}

export function hasLnContext(
  xs: PrimitiveRow[],
  window: number,
): boolean {
  for (const row of xs.slice(0, window)) {
    if (row.lnHeads.length || row.lnBodies.length || row.lnTails.length)
      return true;
  }
  return false;
}

export function isLNBodyContext(xs: PrimitiveRow[]): boolean {
  return xs.length > 0 && xs[0]!.lnBodies.length > 0;
}

function inverseReady(xs: PrimitiveRow[]): boolean {
  if (xs.length < 5) return false;
  const win = xs.slice(0, 5);
  if (win.some((r) => r.normalNotes.length > 0)) return false;
  const maxBodies = Math.max(...win.map((r) => r.lnBodies.length));
  if (maxBodies < INVERSE_MIN_FILLED_LANES) return false;

  const gaps: number[] = [];
  for (let i = 0; i < win.length - 1; i += 1) {
    const wi = win[i]!, wi1 = win[i + 1]!;
    if (wi.lnTails.length > 0 && wi1.lnHeads.length > 0) {
      gaps.push(wi1.time - wi.time);
    }
  }
  if (gaps.length < 2) return false;
  return Math.max(...gaps) - Math.min(...gaps) <= INVERSE_GAP_TOLERANCE_MS;
}

// ============================================================
// Six core pattern detectors
// ============================================================

export function CoreStream(xs: PrimitiveRow[]): number {
  if (xs.length < 5) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!, e = xs[4]!;
  if (
    a.notes === 1 && a.jacks === 0 &&
    b.notes === 1 && b.jacks === 0 &&
    c.notes === 1 && c.jacks === 0 &&
    d.notes === 1 && d.jacks === 0 &&
    e.notes === 1 && e.jacks === 0
  ) {
    if (a.rawNotes[0] !== e.rawNotes[0]) return 5;
  }
  return 0;
}

export function CoreJacks(xs: PrimitiveRow[]): number {
  if (!xs.length) return 0;
  const x0 = xs[0]!;
  return x0.jacks >= 1 && x0.msPerBeat < 2000 ? 1 : 0;
}

export function CoreChordstream(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!;
  // Standard 4-row chordstream
  if (
    a.notes > 1 &&
    a.jacks === 0 &&
    b.jacks === 0 &&
    c.jacks === 0 &&
    d.jacks === 0
  ) {
    if (b.notes > 1 || c.notes > 1 || d.notes > 1) return 4;
  }
  // Sparse hand detection: look for 3+ note hands in 8-row window
  if (xs.length >= 8) {
    let hasHand = false;
    let chordCount = 0;
    for (let i = 0; i < 8; i++) {
      const r = xs[i]!;
      if (r.jacks > 0) return 0; // no jacks allowed
      if (r.notes >= 3) hasHand = true;
      if (r.notes > 1) chordCount++;
    }
    if (hasHand && chordCount >= 2) return 8;
  }
  return 0;
}

export function CoreCoordination(xs: PrimitiveRow[]): number {
  if (!xs.length) return 0;
  const a = xs[0]!;
  return a.lnHeads.length || a.lnBodies.length || a.lnTails.length ? 1 : 0;
}

export function CoreDensity(xs: PrimitiveRow[]): number {
  if (!xs.length) return 0;
  return isLnHeadContext(xs) ? 1 : 0;
}

export function CoreWildcard(xs: PrimitiveRow[]): number {
  if (!xs.length) return 0;
  return isLnHeadContext(xs) ? 1 : 0;
}

// ============================================================
// Jacks sub-detectors
// ============================================================

function JacksChordjacks(xs: PrimitiveRow[]): number {
  if (xs.length < 2) return 0;
  const a = xs[0]!, b = xs[1]!;
  if (
    a.notes > 2 &&
    b.notes > 1 &&
    b.jacks >= 1 &&
    (b.notes < a.notes || b.jacks < b.notes)
  ) {
    return 2;
  }
  return 0;
}

function JacksMinijacks(xs: PrimitiveRow[]): number {
  if (xs.length < 2) return 0;
  const a = xs[0]!, b = xs[1]!;
  return a.jacks > 0 && b.jacks === 0 ? 2 : 0;
}

function JacksLongjacks(xs: PrimitiveRow[]): number {
  if (xs.length < 5) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!, e = xs[4]!;
  if (
    a.jacks > 0 &&
    b.jacks > 0 &&
    c.jacks > 0 &&
    d.jacks > 0 &&
    e.jacks > 0
  ) {
    for (const x of a.rawNotes) {
      if (
        b.rawNotes.includes(x) &&
        c.rawNotes.includes(x) &&
        d.rawNotes.includes(x) &&
        e.rawNotes.includes(x)
      ) {
        return 5;
      }
    }
  }
  return 0;
}

function Jacks4kQuadstream(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  const a = xs[0]!, c = xs[2]!, d = xs[3]!;
  return a.notes === 4 && c.jacks === 0 && d.jacks === 0 ? 4 : 0;
}

function Jacks4kGluts(xs: PrimitiveRow[]): number {
  if (xs.length < 3) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!;
  if (b.jacks === 1 && c.jacks === 1) {
    for (const x of a.rawNotes) {
      if (b.rawNotes.includes(x) && c.rawNotes.includes(x)) return 0;
    }
    return 3;
  }
  return 0;
}

// ============================================================
// Chordstream sub-detectors (4K)
// ============================================================

function Chordstream4kHandstream(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  // Standard: first row is a hand (3 notes), next 3 rows clean
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!;
  if (a.notes === 3 && a.jacks === 0 && b.jacks === 0 && c.jacks === 0 && d.jacks === 0) return 4;
  // Sparse: any row in first 8 has a hand, all rows clean
  if (xs.length >= 8) {
    for (let i = 0; i < 8; i++) {
      const r = xs[i]!;
      if (r.jacks > 0) return 0;
    }
    for (let i = 0; i < 8; i++) {
      if (xs[i]!.notes >= 3) return 8;
    }
  }
  return 0;
}

function Chordstream4kJumpstream(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!;
  if (
    a.notes === 2 &&
    a.jacks === 0 &&
    b.notes === 1 &&
    b.jacks === 0 &&
    c.jacks === 0 &&
    d.jacks === 0
  ) {
    if (c.notes < 3 && d.notes < 3) return 4;
  }
  return 0;
}

function Chordstream4kDoubleJumpstream(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!;
  if (
    a.notes === 1 &&
    a.jacks === 0 &&
    b.notes === 2 &&
    b.jacks === 0 &&
    c.notes === 2 &&
    c.jacks === 0 &&
    d.notes === 1 &&
    d.jacks === 0
  ) {
    return 4;
  }
  return 0;
}

function Chordstream4kTripleJumpstream(xs: PrimitiveRow[]): number {
  if (xs.length < 5) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!, e = xs[4]!;
  if (
    a.notes === 1 &&
    a.jacks === 0 &&
    b.notes === 2 &&
    b.jacks === 0 &&
    c.notes === 2 &&
    c.jacks === 0 &&
    d.notes === 2 &&
    d.jacks === 0 &&
    e.notes === 1 &&
    e.jacks === 0
  ) {
    return 4;
  }
  return 0;
}

function Chordstream4kJumptrill(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!;
  return a.notes === 2 &&
    b.notes === 2 &&
    c.notes === 2 &&
    d.notes === 2 &&
    b.roll &&
    c.roll &&
    d.roll
    ? 4
    : 0;
}

function Chordstream4kSplittrill(xs: PrimitiveRow[]): number {
  if (xs.length < 3) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!;
  return a.notes === 2 &&
    b.notes === 2 &&
    c.notes === 2 &&
    b.jacks === 0 &&
    c.jacks === 0 &&
    !b.roll &&
    !c.roll
    ? 3
    : 0;
}

// ============================================================
// Stream sub-detectors (4K)
// ============================================================

function Stream4kRoll(xs: PrimitiveRow[]): number {
  if (xs.length < 3) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!;
  if (a.notes === 1 && b.notes === 1 && c.notes === 1) {
    const left =
      a.direction === Direction.LEFT &&
      b.direction === Direction.LEFT &&
      c.direction === Direction.LEFT;
    const right =
      a.direction === Direction.RIGHT &&
      b.direction === Direction.RIGHT &&
      c.direction === Direction.RIGHT;
    if (left || right) return 3;
  }
  return 0;
}

function Stream4kTrill(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!;
  if (b.jacks === 0 && c.jacks === 0 && d.jacks === 0) {
    if (
      String(a.rawNotes) === String(c.rawNotes) &&
      String(b.rawNotes) === String(d.rawNotes)
    )
      return 4;
  }
  return 0;
}

function Stream4kMinitrill(xs: PrimitiveRow[]): number {
  if (xs.length < 4) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!, d = xs[3]!;
  if (b.jacks === 0 && c.jacks === 0) {
    if (
      String(a.rawNotes) === String(c.rawNotes) &&
      String(b.rawNotes) !== String(d.rawNotes)
    )
      return 4;
  }
  return 0;
}

// ============================================================
// Chordstream sub-detectors (7K)
// ============================================================

function Chordstream7kDoubleStreams(xs: PrimitiveRow[]): number {
  if (xs.length < 2) return 0;
  const a = xs[0]!, b = xs[1]!;
  return a.notes === 2 && b.notes === 2 && b.jacks === 0 && !b.roll ? 2 : 0;
}

function Chordstream7kDenseChordstream(xs: PrimitiveRow[]): number {
  if (xs.length < 2) return 0;
  const a = xs[0]!, b = xs[1]!;
  return a.notes > 1 && b.notes > 1 && b.jacks === 0 ? 2 : 0;
}

function Chordstream7kLightChordstream(xs: PrimitiveRow[]): number {
  if (xs.length < 2) return 0;
  const a = xs[0]!, b = xs[1]!;
  return a.notes > 1 && b.notes === 1 && b.jacks === 0 ? 2 : 0;
}

function Chordstream7kChordRoll(xs: PrimitiveRow[]): number {
  if (xs.length < 3) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!;
  if (a.notes > 1 && b.notes > 1 && c.notes > 1 && b.roll && c.roll) {
    if (
      (b.direction === Direction.LEFT && c.direction === Direction.LEFT) ||
      (b.direction === Direction.RIGHT && c.direction === Direction.RIGHT)
    ) {
      return 3;
    }
  }
  return 0;
}

function Chordstream7kBrackets(xs: PrimitiveRow[]): number {
  if (xs.length < 3) return 0;
  const a = xs[0]!, b = xs[1]!, c = xs[2]!;
  if (
    a.notes > 2 &&
    b.notes > 2 &&
    c.notes > 2 &&
    !b.roll &&
    !c.roll &&
    b.jacks === 0 &&
    c.jacks === 0
  ) {
    if (a.notes + b.notes + c.notes > 9) return 3;
  }
  return 0;
}

// ============================================================
// Coordination sub-detectors
// ============================================================

function CoordinationColumnLock(xs: PrimitiveRow[]): number {
  if (xs.length < 3) return 0;
  const x0 = xs[0]!;
  const split = x0.leftHandKeys;
  const lnCol = x0.lnHeads.length ? x0.lnHeads[0] : null;
  if (lnCol == null) return 0;

  const adjCols = [lnCol - 1, lnCol + 1].filter(
    (c) => c >= 0 && c < x0.keys && isSameHandAdjacent(lnCol, c, split),
  );
  if (!adjCols.length) return 0;

  // Time-based window: 3 beats (min LN length for uncomfortable LN), not 8 primitive rows
  const windowMs = x0.beatLength * 3;
  const limitTime = x0.time + windowMs;

  for (const adj of adjCols) {
    const hits: number[] = [];
    for (const row of xs) {
      if (row.time > limitTime) break;
      if (!row.lnBodies.includes(lnCol)) continue;
      // Count any playable note on adjacent column (normal, LN head, tap LN)
      if (row.rawNotes.includes(adj)) {
        hits.push(row.time);
      }
    }
    if (hits.length < 2) continue;

    const bpms: number[] = [];
    for (let i = 0; i < hits.length - 1; i += 1) {
      bpms.push(jackBpm(hits[i + 1]! - hits[i]!));
    }
    if (bpms.length && Math.max(...bpms) >= JACKY_MIN_BPM) return 3;
  }

  return 0;
}

function CoordinationShield(xs: PrimitiveRow[]): number {
  if (xs.length < 2) return 0;
  const a = xs[0]!, b = xs[1]!;
  const dt = b.time - a.time;
  const beatLimit = b.beatLength * SHIELD_MAX_BEAT_RATIO;
  if (dt < 0 || dt > beatLimit) return 0;

  for (const col of a.normalNotes) {
    if (b.lnHeads.includes(col)) return 2;
  }
  for (const col of a.lnTails) {
    if (b.normalNotes.includes(col)) return 2;
  }
  return 0;
}

function CoordinationRelease(xs: PrimitiveRow[]): number {
  if (xs.length < RELEASE_MIN_TAIL_ROWS) return 0;
  if (CoordinationShield(xs) !== 0) return 0;
  if (inverseReady(xs)) return 0;
  if (WildcardJack(xs) !== 0) return 0;

  const pickedRows = xs
    .slice(0, RELEASE_SCAN_ROWS)
    .filter((r) => r.lnTails.length === 1);
  if (pickedRows.length < RELEASE_MIN_TAIL_ROWS) return 0;

  const useRows = Math.min(RELEASE_FULL_MATCH_ROWS, pickedRows.length);
  const tails = pickedRows.slice(0, useRows).map((r) => r.lnTails[0]!);

  let prev = [tails[0]!];
  const rows: HeadPointRow[] = [];
  for (let i = 0; i < useRows; i += 1) {
    const row = pickedRows[i]!;
    const cur = [tails[i]!];
    const [direction, roll] = detectDirectionFromCols(prev, cur);
    rows.push({
      index: row.index,
      time: row.time,
      msPerBeat: row.msPerBeat,
      beatLength: row.beatLength,
      notes: 1,
      jacks: cur[0] === prev[0] ? 1 : 0,
      direction,
      roll,
      keys: row.keys,
      leftHandKeys: row.leftHandKeys,
      lnHeads: row.lnHeads,
      lnBodies: row.lnBodies,
      lnTails: row.lnTails,
      normalNotes: [],
      rawNotes: cur,
    });
    prev = cur;
  }

  const effectiveRows = rows.length > 1 ? rows.slice(1) : [];
  if (effectiveRows.length < RELEASE_ROLL_POINTS) return 0;

  let matched = false;
  if (RELEASE_ROLL_POINTS >= 3) {
    matched = Stream4kRoll(effectiveRows.slice(0, RELEASE_ROLL_POINTS)) !== 0;
  } else {
    const firstRow = effectiveRows[0]!;
    const a = firstRow.rawNotes[0]!;
    const b = effectiveRows[1] ? effectiveRows[1]!.rawNotes[0]! : a;
    const dt = effectiveRows[1]
      ? effectiveRows[1]!.time - firstRow.time
      : 0;
    matched = a !== b && dt > 0;
  }

  if (matched) {
    return useRows >= RELEASE_FULL_MATCH_ROWS ? 5 : 4;
  }
  return 0;
}

// ============================================================
// Density sub-detectors
// ============================================================

function Density4kJumpstream(xs: PrimitiveRow[]): number {
  if (xs.length < 4 || !isLnHeadContext(xs)) return 0;
  return Chordstream4kJumpstream(headRows(xs, 4)) !== 0 ? 4 : 0;
}

function Density4kHandstream(xs: PrimitiveRow[]): number {
  if (xs.length < 4 || !isLnHeadContext(xs)) return 0;
  return Chordstream4kHandstream(headRows(xs, 4)) !== 0 ? 4 : 0;
}

function Density4kInverse(xs: PrimitiveRow[]): number {
  return inverseReady(xs) ? 5 : 0;
}

function Density7kDoubleStreams(xs: PrimitiveRow[]): number {
  if (xs.length < 2 || !isLnHeadContext(xs)) return 0;
  return Chordstream7kDoubleStreams(headRows(xs, 2)) !== 0 ? 2 : 0;
}

function Density7kDenseChordstream(xs: PrimitiveRow[]): number {
  if (xs.length < 2 || !isLnHeadContext(xs)) return 0;
  return Chordstream7kDenseChordstream(headRows(xs, 2)) !== 0 ? 2 : 0;
}

function Density7kLightChordstream(xs: PrimitiveRow[]): number {
  if (xs.length < 2 || !isLnHeadContext(xs)) return 0;
  return Chordstream7kLightChordstream(headRows(xs, 2)) !== 0 ? 2 : 0;
}

const Density7kInverse = Density4kInverse;
const DensityOtherDoubleStreams = Density7kDoubleStreams;
const DensityOtherDenseChordstream = Density7kDenseChordstream;
const DensityOtherLightChordstream = Density7kLightChordstream;
const DensityOtherInverse = Density7kInverse;

// ============================================================
// Wildcard sub-detectors
// ============================================================

function WildcardJack(xs: PrimitiveRow[]): number {
  if (xs.length < 2 || !hasLnContext(xs, JACKY_CONTEXT_WINDOW)) return 0;

  const rows = xs
    .slice(0, Math.max(4, JACKY_CONTEXT_WINDOW))
    .filter((r) => r.notes > 0);
  if (rows.length < 2) return 0;

  if (JacksChordjacks(rows) !== 0 || JacksMinijacks(rows) !== 0) return 4;

  const checkRows = rows.slice(0, Math.min(4, rows.length));
  const jackRows = checkRows.filter((r) => r.jacks > 0).length;
  if (jackRows >= 2 && checkRows.some((r) => r.notes >= 2)) return 3;

  const fastestMspb = Math.min(...checkRows.map((r) => r.msPerBeat));
  if (jackRows >= 2 && fastestMspb <= JACKY_FALLBACK_MAX_MSPB) return 3;
  return 0;
}

function WildcardSpeed(xs: PrimitiveRow[]): number {
  if (xs.length < 2 || !hasLnContext(xs, 4)) return 0;

  const rows = headRows(xs, Math.min(4, xs.length));
  if (xs[0]!.keys === 4) {
    if (rows.length >= 3 && Stream4kRoll(rows.slice(0, 3)) !== 0) return 3;
    if (rows.length >= 2) {
      const r0 = rows[0]!, r1 = rows[1]!;
      const sameDir =
        (r0.direction === Direction.LEFT ||
          r0.direction === Direction.RIGHT) &&
        r0.direction === r1.direction;
      if (sameDir || r0.msPerBeat <= 180) return 3;
    }
  } else {
    if (
      rows.length >= 3 &&
      Chordstream7kChordRoll(rows.slice(0, 3)) !== 0
    )
      return 3;
    if (rows.length >= 2) {
      const r0 = rows[0]!, r1 = rows[1]!;
      const cond =
        r0.notes >= 2 &&
        r1.notes >= 2 &&
        r0.direction === r1.direction &&
        (r0.direction === Direction.LEFT ||
          r0.direction === Direction.RIGHT);
      if (cond || r0.msPerBeat <= 170) return 3;
    }
  }
  return 0;
}

// ============================================================
// Specific pattern builders
// ============================================================

interface SpecificPatternMap {
  Stream: SpecificEntry[];
  Chordstream: SpecificEntry[];
  Jacks: SpecificEntry[];
  Coordination: SpecificEntry[];
  Density: SpecificEntry[];
  Wildcard: SpecificEntry[];
}

function makeSpecificPatterns(
  stream: SpecificEntry[],
  chordstream: SpecificEntry[],
  jack: SpecificEntry[],
  coordination: SpecificEntry[],
  density: SpecificEntry[],
  wildcard: SpecificEntry[],
): SpecificPatternMap {
  return {
    Stream: stream,
    Chordstream: chordstream,
    Jacks: jack,
    Coordination: coordination,
    Density: density,
    Wildcard: wildcard,
  };
}

export function SPECIFIC_4K(): SpecificPatternMap {
  const coordination = reorderSpecific(
    [
      ["ColumnLock", CoordinationColumnLock],
      ["Release", CoordinationRelease],
      ["Shield", CoordinationShield],
    ],
    COORDINATION_SPECIFIC_ORDER,
  );

  const density = reorderSpecific(
    [
      ["JS Density", Density4kJumpstream],
      ["HS Density", Density4kHandstream],
      ["Inverse", Density4kInverse],
    ],
    DENSITY_SPECIFIC_ORDER,
  );

  const wildcard = reorderSpecific(
    [
      ["Jacky WC", WildcardJack],
      ["Speedy WC", WildcardSpeed],
    ],
    WILDCARD_SPECIFIC_ORDER,
  );

  return makeSpecificPatterns(
    [
      ["Rolls", Stream4kRoll],
      ["Trills", Stream4kTrill],
      ["MiniTrills", Stream4kMinitrill],
    ],
    [
      ["HandStream", Chordstream4kHandstream],
      ["SplitTrill", Chordstream4kSplittrill],
      ["JumpTrill", Chordstream4kJumptrill],
      ["JumpStream", Chordstream4kJumpstream],
    ],
    [
      ["LongJacks", JacksLongjacks],
      ["QuadStream", Jacks4kQuadstream],
      ["Gluts", Jacks4kGluts],
      ["ChordJacks", JacksChordjacks],
      ["MiniJacks", JacksMinijacks],
    ],
    coordination,
    density,
    wildcard,
  );
}

export function SPECIFIC_7K(): SpecificPatternMap {
  const coordination = reorderSpecific(
    [
      ["ColumnLock", CoordinationColumnLock],
      ["Release", CoordinationRelease],
      ["Shield", CoordinationShield],
    ],
    COORDINATION_SPECIFIC_ORDER,
  );

  const density = reorderSpecific(
    [
      ["DS Density", Density7kDoubleStreams],
      ["DCS Density", Density7kDenseChordstream],
      ["LCS Density", Density7kLightChordstream],
      ["Inverse", Density7kInverse],
    ],
    DENSITY_SPECIFIC_ORDER,
  );

  const wildcard = reorderSpecific(
    [
      ["Jacky WC", WildcardJack],
      ["Speedy WC", WildcardSpeed],
    ],
    WILDCARD_SPECIFIC_ORDER,
  );

  return makeSpecificPatterns(
    [],
    [
      ["Brackets", Chordstream7kBrackets],
      ["Double Stream", Chordstream7kDoubleStreams],
      ["Dense Chordstream", Chordstream7kDenseChordstream],
      ["Light Chordstream", Chordstream7kLightChordstream],
    ],
    [
      ["LongJacks", JacksLongjacks],
      ["ChordJacks", JacksChordjacks],
      ["MiniJacks", JacksMinijacks],
    ],
    coordination,
    density,
    wildcard,
  );
}

export function SPECIFIC_OTHER(): SpecificPatternMap {
  const coordination = reorderSpecific(
    [
      ["ColumnLock", CoordinationColumnLock],
      ["Release", CoordinationRelease],
      ["Shield", CoordinationShield],
    ],
    COORDINATION_SPECIFIC_ORDER,
  );

  const density = reorderSpecific(
    [
      ["DS Density", DensityOtherDoubleStreams],
      ["DCS Density", DensityOtherDenseChordstream],
      ["LCS Density", DensityOtherLightChordstream],
      ["Inverse", DensityOtherInverse],
    ],
    DENSITY_SPECIFIC_ORDER,
  );

  const wildcard = reorderSpecific(
    [
      ["Jacky WC", WildcardJack],
      ["Speedy WC", WildcardSpeed],
    ],
    WILDCARD_SPECIFIC_ORDER,
  );

  return makeSpecificPatterns(
    [],
    [
      ["Chord Rolls", Chordstream7kChordRoll],
      ["Double Stream", Chordstream7kDoubleStreams],
      ["Dense Chordstream", Chordstream7kDenseChordstream],
      ["Light Chordstream", Chordstream7kLightChordstream],
    ],
    [
      ["LongJacks", JacksLongjacks],
      ["ChordJacks", JacksChordjacks],
      ["MiniJacks", JacksMinijacks],
    ],
    coordination,
    density,
    wildcard,
  );
}

// ============================================================
// Re-exports for findPatterns
// ============================================================

export const CORE_STREAM = CoreStream;
export const CORE_JACKS = CoreJacks;
export const CORE_CHORDSTREAM = CoreChordstream;
export const CORE_COORDINATION = CoreCoordination;
export const CORE_DENSITY = CoreDensity;
export const CORE_WILDCARD = CoreWildcard;

// Suppress "declared but never read" for dead-code detectors ported from JS
void Chordstream4kDoubleJumpstream;
void Chordstream4kTripleJumpstream;

