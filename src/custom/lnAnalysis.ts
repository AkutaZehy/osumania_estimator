// ============================================================
// LN Analysis — Long Note metrics
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { SunnyResult } from "../types/algorithm.js";
import type { PatternSummary } from "../types/patterns.js";
import { lowerBound, upperBound } from "../utils/beatmapUtils.js";

interface LN { col: number; start: number; end: number }

function getLNs(p: ParsedBeatmap): LN[] {
  const out: LN[] = [];
  for (let i = 0; i < p.noteTypes.length; i++) {
    if ((p.noteTypes[i]! & 128) !== 0) out.push({ col: p.columns[i]!, start: p.noteStarts[i]!, end: p.noteEnds[i]! });
  }
  return out;
}

function relDiff(s: SunnyResult): number {
  if (!s.bars?.length) return 0;
  let sum = 0, n = 0;
  for (const b of s.bars) { sum += 1 - b.rbar; n++; }
  return n ? Math.round((sum / n) * 10000) / 10000 : 0;
}

function tapLN(p: ParsedBeatmap): number {
  let bl = 500;
  for (const tp of p.timingPoints) { if (tp.uninherited) { bl = tp.beatLength; break; } }
  const max = bl / 4; let c = 0;
  for (let i = 0; i < p.noteTypes.length; i++) {
    if ((p.noteTypes[i]! & 128) && p.noteEnds[i]! - p.noteStarts[i]! <= max) c++;
  }
  return c;
}

function releaseTypes(lns: LN[]): { a: number; r: number } {
  const tailMap = new Map<number, LN[]>();
  for (const l of lns) { const g = tailMap.get(l.end) ?? []; g.push(l); tailMap.set(l.end, g); }
  let a = 0;
  for (const g of tailMap.values()) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (g[i]!.start !== g[j]!.start) a++;
      }
    }
  }
  const startMap = new Map<number, LN[]>();
  for (const l of lns) { const g = startMap.get(l.start) ?? []; g.push(l); startMap.set(l.start, g); }
  let r = 0;
  for (const g of startMap.values()) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (g[i]!.end !== g[j]!.end) r++;
      }
    }
  }
  return { a, r };
}

/** Sweep-line overlap count: O(n log n), handles head-to-tail correctly */
function overlays(lns: LN[]): number {
  const ev: Array<{ t: number; d: 1 | -1 }> = [];
  for (const l of lns) { ev.push({ t: l.start, d: 1 }, { t: l.end, d: -1 }); }
  ev.sort((a, b) => a.t - b.t || a.d - b.d);
  let act = 0, cnt = 0, lastStartT = -1;
  for (const e of ev) {
    if (e.d === 1) {
      if (e.t !== lastStartT) { cnt += Math.min(1, act); lastStartT = e.t; }
      act++;
    } else { act--; }
  }
  return cnt;
}

/**
 * LN-head row texture (whole-chart counterpart of the section-level LN
 * subtypes): rows group simultaneous LN heads within 5 ms (same convention
 * as sectionAnalysis), then classify consecutive head-row transitions.
 *
 * Restores the ln-rework 3.0.0 producers that the perf commit (ebc8061)
 * dropped from summary.ts._lnCounts:
 *  - lnChords: LN heads forming 2+ note chords (LN_Chord)
 *  - wcJacks:  consecutive head rows ≤1 beat apart sharing a column (WC_Jack)
 *  - wcSpeeds: consecutive head rows ≤1/2 beat apart, fully disjoint and
 *              directional (WC_Speed)
 *
 * The cadence gates matter: LN heads are sparse, so raw column-sharing
 * between consecutive heads carries a ~50-95% base rate and no signal.
 * A shared column only reads as a jack when the heads succeed quickly.
 */
function lnHeadTexture(lns: LN[], beatLength: number): { chordLNs: number; wcJacks: number; wcSpeeds: number } {
  if (lns.length === 0) return { chordLNs: 0, wcJacks: 0, wcSpeeds: 0 };
  const sorted = [...lns].sort((a, b) => a.start - b.start);
  const rows: number[][] = [];
  const rowTimes: number[] = [];
  for (const l of sorted) {
    const i = rows.length - 1;
    if (i >= 0 && l.start - rowTimes[i]! <= 5) rows[i]!.push(l.col);
    else { rows.push([l.col]); rowTimes.push(l.start); }
  }

  let chordLNs = 0;
  for (const r of rows) if (r.length >= 2) chordLNs += r.length;

  let wcJacks = 0, wcSpeeds = 0;
  for (let i = 1; i < rows.length; i++) {
    const dt = rowTimes[i]! - rowTimes[i - 1]!;
    const prev = rows[i - 1]!, curr = rows[i]!;
    if (dt <= beatLength && curr.some(c => prev.includes(c))) wcJacks++;
    else if (dt <= beatLength / 2) {
      const pMin = Math.min(...prev), pMax = Math.max(...prev);
      const cMin = Math.min(...curr), cMax = Math.max(...curr);
      if (cMax < pMin || cMin > pMax) wcSpeeds++;
    }
  }

  return { chordLNs, wcJacks, wcSpeeds };
}

export function computeLNMetrics(p: ParsedBeatmap, s: SunnyResult, pt: PatternSummary, _sr = 1) {
  const lns = getLNs(p);
  const { a, r } = releaseTypes(lns);
  const overlaysCount = overlays(lns);

  // Anti-shield: LN tail → normal on same column within 0.25 beats
  // Per-column sorted note starts turn the O(lns × n) full scans (anti-shield
  // and column lock below) into O(lns × log n) binary lookups — the previous
  // loops were quadratic and dominated LN metrics on large maps.
  let antiShields = 0;
  let beatLength = 500;
  for (const tp of p.timingPoints) { if (tp.uninherited) { beatLength = tp.beatLength; break; } }
  const limit = beatLength * 0.25;
  const colAllStarts: number[][] = [[], [], [], []];
  const colNormalStarts: number[][] = [[], [], [], []];
  for (let i = 0; i < p.columns.length; i++) {
    const col = p.columns[i]!;
    const t = p.noteStarts[i]!;
    colAllStarts[col]!.push(t);
    if ((p.noteTypes[i]! & 128) === 0) colNormalStarts[col]!.push(t);
  }
  for (const arr of colAllStarts) arr.sort((a, b) => a - b);
  for (const arr of colNormalStarts) arr.sort((a, b) => a - b);
  for (let i = 0; i < p.columns.length; i++) {
    if ((p.noteTypes[i]! & 128) === 0) continue;
    const endTime = p.noteEnds[i]!;
    const normals = colNormalStarts[p.columns[i]!];
    if (!normals) continue;
    // First normal note strictly after the tail
    const k = upperBound(normals, endTime);
    if (k < normals.length && normals[k]! - endTime <= limit) antiShields++;
  }

  // Strict LN ratio: exclude tap LNs
  const tapCount = tapLN(p);
  const totalLN = lns.length;
  const strictLN = totalLN - tapCount;
  const totalNotes = p.noteStarts.length;

  // Pool score computation — every component is a per-LN percentage so the
  // four pool scores are confidence-like proportions on a shared denominator
  // (comparable at the argmax in display.dominantLNPool). Historically
  // ov/tp divided by LN count while i/s/c divided by total notes, which made
  // the pools incomparable on LN-dominant charts. Each pool is normalized by
  // its weight sum so scores stay within 0-100.
  const lnDen = Math.max(1, totalLN);
  const head = lnHeadTexture(lns, beatLength);
  const s_pct = (pt._lnCounts?.shields ?? 0) / lnDen * 100;
  // Per-LN column lock: count LNs with ≥2 neighbor hits during body period
  const HANDS: [number, number][] = [[0, 1], [2, 3]];
  let perLNclCount = 0;
  for (const ln of lns) {
    const hand = HANDS.find(h => h[0] === ln.col || h[1] === ln.col);
    if (!hand) continue;
    const adjCol = hand[0] === ln.col ? hand[1] : hand[0];
    const starts = colAllStarts[adjCol];
    if (!starts) continue;
    // Inclusive [start, end] range count via binary search
    const hits = upperBound(starts, ln.end) - lowerBound(starts, ln.start);
    if (hits >= 2) perLNclCount++;
  }
  const c_pct = perLNclCount / lnDen * 100;
  const i_pct = (pt._lnCounts?.inverses ?? 0) / lnDen * 100;
  const ch_pct = head.chordLNs / lnDen * 100;
  const wj_pct = head.wcJacks / lnDen * 100;
  const ws_pct = head.wcSpeeds / lnDen * 100;
  const tp_pct = tapCount / Math.max(1, lns.length) * 100;
  const ov_norm = overlaysCount / Math.max(1, lns.length) * 100;
  // Release axis, per-LN participation (same construction as lnChords):
  // an LN participates in a release event when its end-time group holds ≥2
  // LNs with different starts — staggered tails, the S2 "Release" texture.
  // Pairwise rates (a/lnN) live on a different scale than participation
  // rates and can't compete at the argmax; participation keeps all four
  // pools on one scale.
  let relLNs = 0;
  {
    const endMap = new Map<number, LN[]>();
    for (const l of lns) { const g = endMap.get(l.end) ?? []; g.push(l); endMap.set(l.end, g); }
    for (const g of endMap.values()) {
      if (g.length < 2) continue;
      const starts = new Set(g.map(l => l.start));
      if (starts.size >= 2) relLNs += g.length;
    }
  }
  const rel_pct = relLNs / lnDen * 100;
  const r_pct = r / lnDen * 100;

  return {
    ratio: p.lnRatio,
    strictLNRatio: totalNotes > 0 ? strictLN / totalNotes : 0,
    releaseDifficulty: relDiff(s),
    shieldCount: pt._lnCounts?.shields ?? 0,
    antiShieldCount: antiShields,
    reversedShieldCount: antiShields,
    columnLockCount: pt._lnCounts?.columnLocks ?? 0,
    inverseCount: pt._lnCounts?.inverses ?? 0,
    ouroborosCount: pt._lnCounts?.ouroboros ?? 0,
    asyncReleaseCount: a,
    releaseCount: r,
    tapLNCount: tapCount,
    overlayCount: overlaysCount,
    overlapCount: overlaysCount,
    totalLN: lns.length,
    lnStreamCount: pt._lnCounts?.lnStreams ?? 0,
    lnChordCount: head.chordLNs,
    wcJackCount: head.wcJacks,
    wcSpeedCount: head.wcSpeeds,
    coordinationPoolScore: ov_norm * 0.5 + i_pct * 0.2 + c_pct * 0.3,
    densityPoolScore: i_pct * 0.65 + ch_pct * 0.2 + tp_pct * 0.15,
    wildcardPoolScore: wj_pct * 0.45 + ws_pct * 0.45 + s_pct * 0.1,
    technicalPoolScore: rel_pct * 0.5 + r_pct * 0.2 + s_pct * 0.15 + c_pct * 0.15,
  };
}
