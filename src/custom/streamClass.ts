// ============================================================
// Stream (切) Class & Stream Stamina — run/interval extraction on
// the dominant row cadence, per the 切 STA design sessions.
//
// Class  = "[eff] [Full|Dense|Broken|Mid] (JS|HS|SS)[, Jacky][, Technical]"
//          Singles tag → "SS" (no modifier); Full+SS → "Running Man"
//   link    = two ADJACENT rows sharing a column (no row between)
//   cadence = greedy ±15% clusters of row intervals; dominant cluster +
//             secondaries (share≥10%, eff≥60); dominance-first assignment
//   间隔 buckets (k−1, k = dt/C on-grid, chain-intact only):
//     0 = same-column adjacent rows (jack 混入), 1 = 2C (1/2 分度),
//     2 = 3C (3/4 分度), 3 = 4C (1 分度), 4+ = wider
//   非整数  = dt not on any qualifying cadence grid (±10%)
//   tags: Jacky p0>1% · Full p1≥50% · Dense 45≤p1<50 ∧ p1+p2>80%
//         · Broken 15≤p1<30% · Singles p1<15% · Technical p5≥15%
//   JS/HS/SS (streamAnalysis classifyStreamType on-grid rows):
//     3+押≥5% → HS · 2+押≥10% → JS · else SS
// Stamina: max notes in any 10s / 30s sliding window (all note starts).
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { StreamClassInfo } from "../types/custom.js";

interface Row { t: number; cols: number[]; }
interface Cluster { center: number; count: number; eff: number; }

const TOL = 0.10;

const TECHNICAL_MIN_PCT = 15;
const SECONDARY_MIN_SHARE = 0.10;
const SECONDARY_MIN_EFF = 60;
const JACKY_MIN_PCT = 1;

function buildRows(parsed: ParsedBeatmap, speedRate: number): Row[] {
  const notes: Array<{ col: number; t: number }> = [];
  for (let i = 0; i < parsed.noteStarts.length; i++) {
    notes.push({ col: parsed.columns[i] ?? 0, t: parsed.noteStarts[i]! / speedRate });
  }
  notes.sort((a, b) => a.t - b.t);
  const rows: Row[] = [];
  for (const n of notes) {
    const last = rows[rows.length - 1];
    if (last && last.t === n.t) last.cols.push(n.col);
    else rows.push({ t: n.t, cols: [n.col] });
  }
  return rows;
}

function rowCadenceClusters(rows: Row[]): Cluster[] {
  const counts = new Map<number, number>();
  for (let i = 0; i < rows.length - 1; i++) {
    const dt = rows[i + 1]!.t - rows[i]!.t;
    if (dt <= 0 || dt > 1500) continue;
    counts.set(dt, (counts.get(dt) ?? 0) + 1);
  }
  const dts = [...counts.keys()].sort((a, b) => a - b);
  const out: Cluster[] = [];
  let cur: number[] = [];
  for (const dt of dts) {
    const n = counts.get(dt)!;
    if (cur.length && dt > (cur.reduce((s, v) => s + v, 0) / cur.length) * 1.15) {
      const c = cur.reduce((s, v) => s + v, 0) / cur.length;
      out.push({ center: c, count: cur.length, eff: Math.round(15000 / c) });
      cur = [];
    }
    for (let k = 0; k < n; k++) cur.push(dt);
  }
  if (cur.length) {
    const c = cur.reduce((s, v) => s + v, 0) / cur.length;
    out.push({ center: c, count: cur.length, eff: Math.round(15000 / c) });
  }
  return out.filter((c) => c.count >= 4).sort((a, b) => b.count - a.count);
}

/**
 * Compute the 切 Class label and 10s/30s stream stamina peaks.
 * speedRate scales note times into played time (DT=1.5 → faster).
 */
export function computeStreamClass(parsed: ParsedBeatmap, speedRate = 1): StreamClassInfo {
  const empty: StreamClassInfo = { className: "—", eff: 0, w10: 0, w30: 0 };
  if (parsed.noteStarts.length < 20) return empty;

  const rows = buildRows(parsed, speedRate);
  const rowTimes = rows.map((r) => r.t);
  const clusters = rowCadenceClusters(rows);
  if (!clusters.length) return empty;
  const total = clusters.reduce((s, c) => s + c.count, 0);
  const use = clusters.filter((c, i) => i === 0 || (c.count / total >= SECONDARY_MIN_SHARE && c.eff >= SECONDARY_MIN_EFF));

  const rowNear = (t: number, C: number): boolean => {
    let lo = 0, hi = rowTimes.length - 1;
    const lo2 = t - C * TOL, hi2 = t + C * TOL;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = rowTimes[mid]!;
      if (v < lo2) lo = mid + 1;
      else if (v > hi2) hi = mid - 1;
      else return true;
    }
    return false;
  };

  // ---- interval buckets per column ----
  const bucket = [0, 0, 0, 0, 0, 0]; // 间隔0/1/2/3/4+/非整数
  for (let col = 0; col < parsed.columnCount; col++) {
    const times: number[] = [];
    for (let i = 0; i < parsed.noteStarts.length; i++) {
      if (parsed.columns[i] === col) times.push(parsed.noteStarts[i]! / speedRate);
    }
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      const dt = times[i]! - times[i - 1]!;
      if (dt <= 0 || dt > 1500) continue;
      // pass 1: k≥2 on-grid — dominance order; chain-broken pairs skipped
      let done = false;
      for (const c of use) {
        const k = Math.round(dt / c.center);
        if (k < 2) continue;
        if (Math.abs(dt - k * c.center) > c.center * TOL) continue;
        let occupied = true;
        for (let j = 1; j < k; j++) if (!rowNear(times[i - 1]! + j * c.center, c.center)) { occupied = false; break; }
        if (occupied) {
          const gap = k - 1;
          if (gap === 1) bucket[1]!++;
          else if (gap === 2) bucket[2]!++;
          else if (gap === 3) bucket[3]!++;
          else bucket[4]!++;
        }
        done = true;
        break;
      }
      if (done) continue;
      // pass 2: k=1 (间隔0) — on some cadence grid AND truly adjacent rows
      let onGrid = false;
      for (const c of use) {
        if (Math.abs(dt - c.center) <= c.center * TOL) { onGrid = true; break; }
      }
      if (onGrid) {
        let hasRowBetween = false;
        {
          let lo = 0, hi = rowTimes.length - 1;
          const lo2 = times[i - 1]! + 1, hi2 = times[i]! - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const v = rowTimes[mid]!;
            if (v < lo2) lo = mid + 1;
            else if (v > hi2) hi = mid - 1;
            else { hasRowBetween = true; break; }
          }
        }
        if (!hasRowBetween) bucket[0]!++;
        continue;
      }
      bucket[5]!++; // 非整数间隔
    }
  }
  const tot = bucket.reduce((s, v) => s + v, 0);
  const pct = (i: number) => tot ? 100 * bucket[i]! / tot : 0;

  // ---- tags ----
  const tags: string[] = [];
  if (pct(0) > JACKY_MIN_PCT) tags.push("Jacky");
  if (pct(1) >= 50) tags.push("Full");
  else if (pct(1) >= 45 && pct(1) + pct(2) > 80) tags.push("Dense");
  else if (pct(1) >= 15 && pct(1) < 30) tags.push("Broken");
  else if (pct(1) < 15) tags.push("Singles");
  if (pct(5) >= TECHNICAL_MIN_PCT) tags.push("Technical");

  // ---- row composition on the dominant grid → JS/HS/SS ----
  let single = 0, dbl = 0, tri = 0;
  const C = clusters[0]!.center;
  for (let i = 0; i < rows.length; i++) {
    const nearPrev = i > 0 && Math.abs(rows[i]!.t - rows[i - 1]!.t - C) <= C * TOL;
    const nearNext = i < rows.length - 1 && Math.abs(rows[i + 1]!.t - rows[i]!.t - C) <= C * TOL;
    if (!nearPrev && !nearNext) continue;
    const n = rows[i]!.cols.length;
    if (n === 1) single++;
    else if (n === 2) dbl++;
    else tri++;
  }
  const rcAll = single + dbl + tri;
  const threePct = rcAll ? tri / rcAll : 0;
  const twoPct = rcAll ? (dbl + tri) / rcAll : 0;
  const isSingles = tags.includes("Singles");
  const streamType = threePct >= 0.05 ? "HS" : twoPct >= 0.10 ? "JS" : "SS";
  const type = isSingles ? "SS" : streamType;
  const modifier = isSingles ? "" : tags.includes("Full") ? "Full" : tags.includes("Dense") ? "Dense" : tags.includes("Broken") ? "Broken" : "Mid";
  const suffix: string[] = [];
  if (tags.includes("Jacky")) suffix.push("Jacky");
  if (tags.includes("Technical")) suffix.push("Technical");
  // Full + pure single-note stream → Running Man
  const head = modifier === "Full" && type === "SS" ? "Running Man" : `${modifier ? modifier + " " : ""}${type}`;
  const className = `${clusters[0]!.eff} ${head}${suffix.length ? ", " + suffix.join(", ") : ""}`;

  // ---- sliding-window stamina ----
  const starts = rows.map((r) => r.t);
  const maxWin = (ms: number): number => {
    let best = 0, j = 0;
    for (let i = 0; i < starts.length; i++) {
      while (starts[i]! - starts[j]! > ms) j++;
      if (i - j + 1 > best) best = i - j + 1;
    }
    return best;
  };

  return {
    className,
    eff: clusters[0]!.eff,
    w10: maxWin(10000),
    w30: maxWin(30000),
  };
}
