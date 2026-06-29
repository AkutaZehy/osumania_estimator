// ============================================================
// LN Analysis — Long Note metrics
// ============================================================

import type { LNMetrics } from "../types/custom.js";
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
  return n ? Math.round((sum/n)*10000)/10000 : 0;
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

function releaseTypes(lns: LN[]): { a: number; r: number } {
  // A (Attack): different start, same tail (tail-time grouping, count cross-start pairs)
  const tailMap = new Map<number, LN[]>();
  for (const l of lns) { const g = tailMap.get(l.end)??[]; g.push(l); tailMap.set(l.end, g); }
  let a = 0;
  for (const g of tailMap.values()) {
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (g[i]!.start !== g[j]!.start) a++;
      }
    }
  }

  // R (Release): same start, different tail (start-time grouping, count cross-tail pairs)
  const startMap = new Map<number, LN[]>();
  for (const l of lns) { const g = startMap.get(l.start)??[]; g.push(l); startMap.set(l.start, g); }
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

export function computeLNMetrics(p: ParsedBeatmap, s: SunnyResult, pt: PatternSummary, _sr=1) {
  const lns = getLNs(p);
  const {a,r} = releaseTypes(lns);

  // Anti-shield: LN tail → normal on same column within 0.25 beats
  let antiShields = 0;
  let beatLength = 500;
  for (const tp of p.timingPoints) { if (tp.uninherited) { beatLength = tp.beatLength; break; } }
  const limit = beatLength * 0.25;
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

  return {
    ratio: p.lnRatio,
    strictLNRatio: totalNotes > 0 ? strictLN / totalNotes : 0,
    releaseDifficulty: relDiff(s),
    shieldCount: pt._lnCounts?.shields ?? 0,
    antiShieldCount: antiShields,
    columnLockCount: pt._lnCounts?.columnLocks ?? 0,
    inverseCount: pt._lnCounts?.inverses ?? 0,
    asyncReleaseCount: a,
    releaseCount: r,
    tapLNCount: tapCount,
    overlayCount: overlays(lns),
    totalLN: lns.length,
  };
}
