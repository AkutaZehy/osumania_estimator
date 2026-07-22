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

function tapLN(p: ParsedBeatmap): number {
  let bl = 500;
  for (const tp of p.timingPoints) { if (tp.uninherited) { bl = tp.beatLength; break; } }
  const max = bl/4; let c = 0;
  for (let i = 0; i < p.noteTypes.length; i++) {
    if ((p.noteTypes[i]!&128) && p.noteEnds[i]!-p.noteStarts[i]! <= max) c++;
  }
  return c;
}

function overlays(lns: LN[]): number {
  const ev: Array<{t:number; d:1|-1}> = [];
  for (const l of lns) { ev.push({t:l.start,d:1},{t:l.end,d:-1}); }
  // Starts before ends at same time → head-to-tail (end==next start) NOT counted
  ev.sort((a,b)=>a.t-b.t||a.d-b.d);
  let act=0, cnt=0, lastStartT=-1;
  for (const e of ev) {
    if (e.d===1) {
      // Skip simultaneous starts (chords) — only count first
      if (e.t !== lastStartT) { cnt += Math.min(1,act); lastStartT = e.t; }
      act++;
    } else { act--; }
  }
  return cnt;
}

export function computeLNMetrics(p: ParsedBeatmap, _s: SunnyResult, pt: PatternSummary, _sr=1) {
  const lns = getLNs(p);
  const overlaysCount = overlays(lns);

  // Reversed shield: LN tail → normal on same column within LN_TIME_WINDOW_MS
  let antiShields = 0;
  // Reversed Shield uses fixed LN_TIME_WINDOW_MS (83ms) instead of BPM-relative
  const limit = 83; // LN_TIME_WINDOW_MS
  for (let i = 0; i < p.columns.length; i++) {
    if ((p.noteTypes[i]! & 128) === 0) continue; // skip non-LN
    const endTime = p.noteEnds[i]!;
    const col = p.columns[i]!;
    for (let j = 0; j < p.columns.length; j++) {
      if (i === j) continue;
      if ((p.noteTypes[j]! & 128) !== 0) continue; // only normal notes
      if (p.columns[j]! === col && p.noteStarts[j]! > endTime && p.noteStarts[j]! - endTime <= limit) {
        antiShields++;
        break; // one anti-shield per tail
      }
    }
  }

  // Strict LN ratio: exclude tap LNs from LN count
  const tapCount = tapLN(p);
  const totalLN = lns.length;
  const strictLN = totalLN - tapCount;
  const totalNotes = p.noteStarts.length;

  // Normalize all Interlude counts by totalNotes (percentage scale)
  const sn = Math.max(1, totalNotes);
  const s_pct = (pt._lnCounts?.shields ?? 0) / sn * 100;
  // Per-LN columnLock: count LNs with ≥2 neighbor hits during body period (same as gridAnalysis)
  const HANDS: [number, number][] = [[0,1],[2,3]];
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
    shieldCount: pt._lnCounts?.shields ?? 0,
    reversedShieldCount: antiShields,
    columnLockCount: pt._lnCounts?.columnLocks ?? 0,
    inverseCount: pt._lnCounts?.inverses ?? 0,
    ouroborosCount: pt._lnCounts?.ouroboros ?? 0,
    overlapCount: overlaysCount,
    lnStreamCount: pt._lnCounts?.lnStreams ?? 0,
    lnChordCount: pt._lnCounts?.lnChords ?? 0,
    wcJackCount: pt._lnCounts?.wcJacks ?? 0,
    wcSpeedCount: pt._lnCounts?.wcSpeeds ?? 0,
    tapLNCount: tapCount,
    totalLN: lns.length,
    coordinationPoolScore: ov_norm * 0.7 + i_pct * 0.3,
    densityPoolScore: i_pct * 0.6 + ch_pct * 1.0 + tp_pct * 0.5,
    wildcardPoolScore: s_pct * 0.5 + c_pct * 0.5 + wj_pct * 1.0 + ws_pct * 1.0,
    technicalPoolScore: ov_norm * 0.3 + s_pct * 0.5 + c_pct * 0.5 + tp_pct * 0.5,
  };
}
