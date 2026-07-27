// ============================================================
// LN Analysis — Long Note metrics
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { SunnyResult } from "../types/algorithm.js";
import type { PatternSummary } from "../types/patterns.js";

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

export function computeLNMetrics(p: ParsedBeatmap, s: SunnyResult, pt: PatternSummary, _sr = 1) {
  const lns = getLNs(p);
  const { a, r } = releaseTypes(lns);
  const overlaysCount = overlays(lns);

  // Anti-shield: LN tail → normal on same column within 0.25 beats
  let antiShields = 0;
  let beatLength = 500;
  for (const tp of p.timingPoints) { if (tp.uninherited) { beatLength = tp.beatLength; break; } }
  const limit = beatLength * 0.25;
  for (let i = 0; i < p.columns.length; i++) {
    if ((p.noteTypes[i]! & 128) === 0) continue;
    const endTime = p.noteEnds[i]!;
    const col = p.columns[i]!;
    for (let j = 0; j < p.columns.length; j++) {
      if (i === j) continue;
      if ((p.noteTypes[j]! & 128) !== 0) continue;
      if (p.columns[j]! === col && p.noteStarts[j]! > endTime && p.noteStarts[j]! - endTime <= limit) {
        antiShields++;
        break;
      }
    }
  }

  // Strict LN ratio: exclude tap LNs
  const tapCount = tapLN(p);
  const totalLN = lns.length;
  const strictLN = totalLN - tapCount;
  const totalNotes = p.noteStarts.length;

  // Pool score computation (normalized by totalNotes)
  const sn = Math.max(1, totalNotes);
  const s_pct = (pt._lnCounts?.shields ?? 0) / sn * 100;
  // Per-LN column lock: count LNs with ≥2 neighbor hits during body period
  const HANDS: [number, number][] = [[0, 1], [2, 3]];
  let perLNclCount = 0;
  for (const ln of lns) {
    const hand = HANDS.find(h => h[0] === ln.col || h[1] === ln.col);
    if (!hand) continue;
    const adjCol = hand[0] === ln.col ? hand[1] : hand[0];
    let hits = 0;
    for (let i = 0; i < p.noteStarts.length; i++) {
      if (p.columns[i]! === adjCol && p.noteStarts[i]! >= ln.start && p.noteStarts[i]! <= ln.end) hits++;
    }
    if (hits >= 2) perLNclCount++;
  }
  const c_pct = perLNclCount / sn * 100;
  const i_pct = (pt._lnCounts?.inverses ?? 0) / sn * 100;
  const ch_pct = (pt._lnCounts?.lnChords ?? 0) / sn * 100;
  const wj_pct = (pt._lnCounts?.wcJacks ?? 0) / sn * 100;
  const ws_pct = (pt._lnCounts?.wcSpeeds ?? 0) / sn * 100;
  const tp_pct = tapCount / Math.max(1, lns.length) * 100;
  const ov_norm = overlaysCount / Math.max(1, lns.length) * 100;

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
    lnChordCount: pt._lnCounts?.lnChords ?? 0,
    wcJackCount: pt._lnCounts?.wcJacks ?? 0,
    wcSpeedCount: pt._lnCounts?.wcSpeeds ?? 0,
    coordinationPoolScore: ov_norm * 0.7 + i_pct * 0.3,
    densityPoolScore: i_pct * 0.6 + ch_pct * 1.0 + tp_pct * 0.5,
    wildcardPoolScore: s_pct * 0.5 + c_pct * 0.5 + wj_pct * 1.0 + ws_pct * 1.0,
    technicalPoolScore: ov_norm * 0.3 + s_pct * 0.5 + c_pct * 0.5 + tp_pct * 0.5,
  };
}
