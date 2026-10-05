// ============================================================
// WDS0-like marker — 密度-糊度-词 三轴标记（叠 Jack / 切 Stream / 乱 Speed）
//   密度：叠=P90×锚值、切=3C 节弹 P50、乱=节密度 P90
//   糊度：叠=deltaA（hand 三押≥20% 强制 Reg）、切=节锁2覆盖率、乱=lock2
//   词表：密度 S=Low M=Mid L=High H=Full；糊度 M=Manip R=Reg T=Tech
// 口径与 test/wdsDanContrast.test.ts 一致；术语见记忆 manip-grade-letters。
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";

export interface WdsMarker {
  /** "Mid-Reg-Jack" 样式；"—" = 无法计算 */
  jack: string;
  /** "High-Tech-Stream" 样式 */
  stream: string;
  /** "Mid-Tech-Speed" 样式；trill 型带 " trill?" 后缀 */
  speed: string;
}

const SPEED_M_LINE = 7.02;
const SPEED_L_LINE = 9.04;

interface Row { t: number; a: boolean[]; n: number }

function buildRows(parsed: ParsedBeatmap): Row[] {
  const byT = new Map<number, boolean[]>();
  for (let i = 0; i < parsed.noteStarts.length; i++) {
    const c = parsed.columns[i] ?? 0;
    if (c < 0 || c > 3) continue;
    let a = byT.get(parsed.noteStarts[i]!);
    if (!a) byT.set(parsed.noteStarts[i]!, a = [false, false, false, false]);
    a[c] = true;
  }
  return [...byT].sort((x, y) => x[0] - y[0]).map(([t, a]) => ({ t, a, n: a.filter(Boolean).length }));
}

/** 主导行 cadence：±15% 贪心簇（count≥4 取最大簇中心） */
function dominantCadence(rows: Row[]): number | null {
  if (rows.length < 8) return null;
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i]!.t - rows[i - 1]!.t);
  gaps.sort((a, b) => a - b);
  const clusters: Array<{ center: number; count: number }> = [];
  for (const g of gaps) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(g - last.center) / last.center < 0.15) {
      last.center = (last.center * last.count + g) / (last.count + 1);
      last.count++;
    } else clusters.push({ center: g, count: 1 });
  }
  const dom = clusters.filter((c) => c.count >= 4).sort((a, b) => b.count - a.count)[0];
  return dom ? dom.center : null;
}

/** 节密度（16 拍节内 4 行滑窗均值）→ { mean, p90 } */
function sectionDensity(rows: Row[], C: number): { mean: number; p90: number } | null {
  const sectionMs = 64 * C;
  const segs = splitSegments(rows);
  const means: number[] = [];
  for (const [ss, ee] of segs) {
    const nB = Math.floor((ee - ss) / sectionMs + 1e-9);
    for (let b = 0; b < nB; b++) {
      const bs = ss + b * sectionMs, be = bs + sectionMs;
      const inB = rows.filter((r) => r.t >= bs && r.t < be);
      if (inB.length < 4) continue;
      let sum = 0, cnt = 0;
      for (let i = 0; i + 3 < inB.length; i++) {
        sum += inB[i]!.n + inB[i + 1]!.n + inB[i + 2]!.n + inB[i + 3]!.n;
        cnt++;
      }
      if (cnt) means.push(sum / cnt);
    }
  }
  if (!means.length) return null;
  const sorted = [...means].sort((a, b) => a - b);
  return {
    mean: means.reduce((a, b) => a + b, 0) / means.length,
    p90: sorted[Math.floor(0.9 * (sorted.length - 1))]!,
  };
}

function splitSegments(rows: Row[]): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  if (!rows.length) return segs;
  let s = rows[0]!.t, prev = rows[0]!.t;
  for (const r of rows) {
    if (r.t - prev > 2000) { segs.push([s, prev]); s = r.t; }
    prev = r.t;
  }
  segs.push([s, prev]);
  return segs;
}

/** 3C 节弹 P50：节内同列间隔 ≤3C 的重复对 / 节音符数，取节中位数 */
function bullet3CP50(rows: Row[], C: number): number | null {
  const sectionMs = 64 * C;
  const segs = splitSegments(rows);
  const ratios: number[] = [];
  for (const [ss, ee] of segs) {
    const nB = Math.floor((ee - ss) / sectionMs + 1e-9);
    for (let b = 0; b < nB; b++) {
      const bs = ss + b * sectionMs, be = bs + sectionMs;
      const inB = rows.filter((r) => r.t >= bs && r.t < be);
      if (inB.length < 4) continue;
      const notes = inB.reduce((s2, r) => s2 + r.n, 0);
      const ct: number[][] = [[], [], [], []];
      for (const r of inB) for (let c = 0; c < 4; c++) if (r.a[c]) ct[c]!.push(r.t);
      let hits = 0;
      for (const arr of ct) for (let i = 1; i < arr.length; i++) if (arr[i]! - arr[i - 1]! <= 3 * C) hits++;
      ratios.push(notes ? hits / notes : 0);
    }
  }
  if (!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)]!;
}

/** 帐篷失衡 U = 1 − |max−2·min|/max（空手 0） */
function tent(max: number, min: number): number {
  return max === 0 ? 0 : 1 - Math.abs(max - 2 * min) / max;
}

/** 全步锚值（站方 spike.js 口径，步距固定 = 窗/2，已证与四步距 min 等价） */
function anchorFull(times: number[], cols: number[], duration: number): number | null {
  const N = times.length;
  if (!N || duration <= 0) return null;
  const pc: Uint32Array[] = [0, 1, 2, 3].map(() => new Uint32Array(N + 1));
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 4; c++) pc[c]![i + 1] = pc[c]![i]!;
    const ci = cols[i]!;
    pc[ci]![i + 1] = pc[ci]![i + 1]! + 1;
  }
  let minAnchor = Infinity;
  for (let d = 16; d <= 1024; d++) {
    const wMs = duration / d, stMs = wMs / 2, steps = (d - 1) * 2;
    let sumU = 0, cnt = 0, iF = 0, iT = 0;
    for (let j = 0; j <= steps; j++) {
      const from = j * stMs, to = j === steps ? duration : from + wMs;
      while (iT < N && times[iT]! <= to) iT++;
      while (iF < iT && times[iF]! < from) iF++;
      for (const [a, b] of [[0, 1], [2, 3]] as const) {
        const c0 = pc[a]![iT]! - pc[a]![iF]!, c1 = pc[b]![iT]! - pc[b]![iF]!;
        sumU += tent(Math.max(c0, c1), Math.min(c0, c1));
        cnt++;
      }
    }
    minAnchor = Math.min(minAnchor, 1.135 - 0.06 * (sumU / cnt));
  }
  return Number.isFinite(minAnchor) ? minAnchor : null;
}

/** 1cell 锚值：16 拍节窗、步 w/2，逐有效段（音乐平均口径） */
function anchor1Cell(C: number, notes: Array<{ t: number; col: number }>, segs: Array<[number, number]>): number | null {
  const N = notes.length;
  const pc: Uint32Array[] = [0, 1, 2, 3].map(() => new Uint32Array(N + 1));
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 4; c++) pc[c]![i + 1] = pc[c]![i]!;
    const ni = notes[i]!;
    pc[ni.col]![i + 1] = pc[ni.col]![i + 1]! + 1;
  }
  const w = 64 * C, step = w / 2;
  let sumU = 0, cnt = 0, iF = 0, iT = 0;
  for (const [ss, ee] of segs) {
    for (let from = ss; from < ee; from += step) {
      const to = Math.min(from + w, ee);
      while (iT < N && notes[iT]!.t <= to) iT++;
      while (iF < iT && notes[iF]!.t < from) iF++;
      for (const [a, b] of [[0, 1], [2, 3]] as const) {
        const c0 = pc[a]![iT]! - pc[a]![iF]!, c1 = pc[b]![iT]! - pc[b]![iF]!;
        sumU += tent(Math.max(c0, c1), Math.min(c0, c1));
        cnt++;
      }
    }
  }
  if (!cnt) return null;
  return 1.135 - 0.06 * (sumU / cnt);
}

/** 锁定度：lock1=k1 连打、lock2=k2 交替、tri=三押行占比、cov=节锁2≥35% 覆盖率 */
function lockMetrics(rows: Row[], C: number): { lock1: number; lock2: number; tri: number; cov: number } {
  const bucket = [0, 0, 0, 0, 0, 0];
  for (let col = 0; col < 4; col++) {
    const ts = rows.filter((r) => r.a[col]).map((r) => r.t);
    for (let i = 1; i < ts.length; i++) {
      const dt = ts[i]! - ts[i - 1]!;
      if (dt <= 0 || dt > 16 * C) continue;
      const k = Math.round(dt / C);
      if (Math.abs(dt - k * C) <= C * 0.15) {
        if (k === 1) bucket[0]!++;
        else if (k <= 5) bucket[k - 1]!++;
        else bucket[4]!++;
      } else bucket[5]!++;
    }
  }
  const den = bucket[0]! + bucket[1]! + bucket[2]! + bucket[3]! + bucket[4]!;
  let single = 0, dbl = 0, tri = 0;
  for (const r of rows) {
    if (r.n === 0) continue;
    if (r.n === 1) single++;
    else if (r.n === 2) dbl++;
    else tri++;
  }
  // 覆盖率：节锁2≥35% 的完整节占比
  const sectionMs = 64 * C;
  const segs = splitSegments(rows);
  let covN = 0, covHit = 0;
  for (const [ss, ee] of segs) {
    const nB = Math.floor((ee - ss) / sectionMs + 1e-9);
    for (let b = 0; b < nB; b++) {
      const bs = ss + b * sectionMs, be = bs + sectionMs;
      const inB = rows.filter((r) => r.t >= bs && r.t < be);
      if (inB.length < 4) continue;
      const bu = [0, 0, 0, 0, 0, 0];
      for (let col = 0; col < 4; col++) {
        const ts = inB.filter((r) => r.a[col]).map((r) => r.t);
        for (let i = 1; i < ts.length; i++) {
          const dt = ts[i]! - ts[i - 1]!;
          if (dt <= 0 || dt > 16 * C) continue;
          const k = Math.round(dt / C);
          if (Math.abs(dt - k * C) <= C * 0.15) { if (k === 1) bu[0]!++; else if (k <= 5) bu[k - 1]!++; else bu[4]!++; }
          else bu[5]!++;
        }
      }
      const den2 = bu[0]! + bu[1]! + bu[2]! + bu[3]! + bu[4]!;
      if (den2 < 8) continue;
      covN++;
      if (100 * bu[1]! / den2 >= 35) covHit++;
    }
  }
  return {
    lock1: den ? 100 * bucket[0]! / den : 0,
    lock2: den ? 100 * bucket[1]! / den : 0,
    tri: single + dbl + tri ? 100 * tri / (single + dbl + tri) : 0,
    cov: covN ? 100 * covHit / covN : 0,
  };
}

const densWord = (l: string) => (l === "S" ? "Low" : l === "M" ? "Mid" : l === "L" ? "High" : "Full");
const manipWord = (l: string) => (l === "M" ? "Manip" : l === "R" ? "Reg" : "Tech");
const rawAnchorLetter = (a: number) => (a >= 1.1 ? "M" : a >= 1.09 ? "R" : "T");

export function computeWdsMarker(parsed: ParsedBeatmap): WdsMarker {
  const empty: WdsMarker = { jack: "—", stream: "—", speed: "—" };
  if (parsed.noteStarts.length < 8) return empty;
  const rows = buildRows(parsed);
  const C = dominantCadence(rows);
  if (!C) return empty;

  const dens = sectionDensity(rows, C);
  const b3 = bullet3CP50(rows, C);
  const lock = lockMetrics(rows, C);
  if (!dens || b3 == null) return empty;

  // 全步锚值（有效段重定基拼接）+ 1cell 锚值 → deltaA
  const segs = splitSegments(rows);
  const times: number[] = [], cols: number[] = [];
  const notes: Array<{ t: number; col: number }> = [];
  let duration = 0;
  for (const [ss, ee] of segs) {
    for (const r of rows) {
      if (r.t < ss || r.t > ee) continue;
      for (let c = 0; c < 4; c++) if (r.a[c]) { times.push(duration + (r.t - ss)); cols.push(c); notes.push({ t: duration + (r.t - ss), col: c }); }
    }
    duration += ee - ss;
  }
  const aFull = anchorFull(times, cols, duration);
  const aCell = anchor1Cell(C, notes, segs);
  if (aFull == null) return empty;
  const delta = aCell != null ? aCell - aFull : null;

  // 叠：密度 = P90×锚值，糊度 = deltaA（hand 强制 Reg）
  const pxa = dens.p90 * aFull;
  const jD = pxa < 8 ? "S" : pxa < 10 ? "M" : pxa < 12 ? "L" : "H";
  const jM = lock.tri >= 20
    ? "R"
    : aFull <= 1.11 && delta != null ? (delta < 0.005 ? "M" : delta > 0.01 ? "T" : "R") : rawAnchorLetter(aFull);
  // 切：密度 = 3C 节弹，糊度 = 覆盖率
  const sD = b3 < 0.4 ? "S" : b3 < 0.75 ? "M" : b3 < 1.1 ? "L" : "H";
  const sM = lock.cov < 35 ? "M" : lock.cov < 60 ? "R" : "T";
  // 乱：密度 = P90，糊度 = lock2；trill 旗标
  const pD = dens.p90 >= SPEED_L_LINE ? "L" : dens.p90 >= SPEED_M_LINE ? "M" : "S";
  const pM = lock.lock2 < 8.5 ? "M" : lock.lock2 < 21 ? "R" : "T";
  const trill = dens.p90 < SPEED_M_LINE && lock.lock2 >= 50 ? " trill?" : "";

  return {
    jack: `${densWord(jD)}-${manipWord(jM)}-Jack`,
    stream: `${densWord(sD)}-${manipWord(sM)}-Stream`,
    speed: `${densWord(pD)}-${manipWord(pM)}-Speed${trill}`,
  };
}
