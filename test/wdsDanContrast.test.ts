// ============================================================
// WDS 密度档对照 — reform/regular dans × 本仓 jackClass/streamClass
//
// 密度单位（2026-10-05 与用户对齐）：照抄本仓 jack density —— 4 行滑窗音符数。
//   该单位同时适配 WDS 三张阈值表：叠 8/10/12 = 本仓 chordjack 密度带
//   (DENSITY_LOW=8/DENSITY_HIGH=15)；切 ≥4.75 要求和弦内容（纯 1/4 单流=4.0
//   落"单押"）；乱 <9.5 排除和弦叠。站方自家代码的 density（notes/len ×
//   4/(bpm/180)）与其阈值差一个量级且 osu 上传路径不出细化键型，不可用。
// 计算方式（用户规定）：有效段（>2s 空隙切段）内、以主导行 cadence（effBPM，
//   照抄 streamClass.rowCadenceClusters）为节拍基准，每 16 拍（4 小节）切一节，
//   节内 4 行滑窗音符数取均值，图级密度 = 各完整节均值的平均。
// WDS 阈值表（无风格档 F/R/P）：
//   叠 <8 小叠 / <10 中叠 / <12 大叠 / ≥12 满叠
//   切 <4.75 无档 / <6 稀切 / <7 中切 / <7.5 高切 / ≥7.5 满切
//   乱 <8 单押 / <8.5 稀疏 / <9.5 稠密 / ≥9.5 无档
// 段位映射（用户规定 2026-10-05）：
//   reform  1st..10th = 1..10, Alpha..Epsilon = 11..15
//   regular Reg-1..10 = 1..10, Reg-0(Starter) = 0, Ex-1..9 = 11..19, Ex-Final = 20
// Run: esbuild test/wdsDanContrast.test.ts --bundle --platform=node \
//        --format=esm --outfile=dist/wdsDanContrast.mjs && node dist/wdsDanContrast.mjs
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { ParsedBeatmap } from "../src/types/beatmap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sibling-repo relative path (no machine-local absolute paths).
const MAPS_ROOT = path.resolve(__dirname, "../../osu diff/work-r1/maps");
// Bundled run has __dirname=dist/, so anchor the report to the repo cwd.
const REPORT_PATH = path.resolve(process.cwd(), "test", "wdsDanContrast.report.md");

const GROUPS = [
  { label: "Reform Jack", dir: "reform dans/jack" },
  { label: "Reform Stamina", dir: "reform dans/stamina" },
  { label: "Regular Jack", dir: "regular dans/jack" },
  { label: "Regular Stream", dir: "regular dans/stream" },
  { label: "Reform Speed", dir: "reform dans/speed" },
  { label: "Regular Speed", dir: "regular dans/speed" },
  { label: "Reform Tech", dir: "reform dans/tech" },
  { label: "Regular Tech", dir: "regular dans/tech" },
];

type GroupCfg = { label: string; dir: string; bulletC?: number };

const GREEK: Record<string, number> = { Alpha: 11, Beta: 12, Gamma: 13, Delta: 14, Epsilon: 15 };

/** Diff 段 = 文件名里最后一个 "] " 括号组（跳过 "([GS]hina)" 这类 artist 括号）。 */
function diffTag(file: string): string {
  const cut = file.lastIndexOf(") [");
  let s = cut >= 0 ? file.slice(cut + 3) : file.slice(file.lastIndexOf("[") + 1);
  const end = s.lastIndexOf("]");
  if (end >= 0) s = s.slice(0, end);
  return s;
}

function danNumber(file: string, dir: string): number {
  if (dir.startsWith("reform")) {
    const m = diffTag(file).match(/~ ([A-Za-z0-9]+) ~ /);
    if (!m) throw new Error(`无法解析 reform 段位: ${file}`);
    const ord = m[1]!.match(/^(\d+)(?:st|nd|rd|th)$/);
    if (ord) return parseInt(ord[1]!, 10);
    if (GREEK[m[1]!] != null) return GREEK[m[1]!]!;
    throw new Error(`未知 reform 段位 "${m[1]}": ${file}`);
  }
  const reg = file.match(/Reg-(\d+)/);
  if (reg) return parseInt(reg[1]!, 10);
  const ex = file.match(/Extra-(\d+)/);
  if (ex) return 10 + parseInt(ex[1]!, 10);
  if (/Extra-Final/.test(file)) return 20;
  throw new Error(`无法解析 regular 段位: ${file}`);
}

function shortName(file: string, dir: string): string {
  let s = diffTag(file);
  if (dir.startsWith("reform")) s = s.replace(/ ~ [A-Za-z0-9]+ ~ \(Marathon\)$/, "");
  else s = s.replace(/^(Reg-\d+|Extra-(?:\d+|Final))\s+/, "");
  return s.length > 44 ? s.slice(0, 43) + "…" : s;
}

/** Dominant BPM = uninherited timing point covering the longest span. */
function dominantBpm(parsed: ParsedBeatmap): number | null {
  const pts = parsed.timingPoints.filter((p) => p.uninherited && p.beatLength > 0).sort((a, b) => a.time - b.time);
  if (!pts.length) return null;
  const end = parsed.lastNote || parsed.duration;
  let best: { bpm: number; span: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const next = i + 1 < pts.length ? pts[i + 1]!.time : end;
    const span = Math.max(0, next - pts[i]!.time);
    const bpm = 60000 / pts[i]!.beatLength;
    if (!best || span > best.span) best = { bpm, span };
  }
  return best ? Math.round(best.bpm) : null;
}

// ---------------------------------------------------------------------------
// WDS 密度：有效段 × effBPM 16 拍节 × 4 行滑窗均值（单位同本仓 jack density）
// ---------------------------------------------------------------------------

interface NoteRow { t: number; n: number; }

function buildRows(parsed: ParsedBeatmap): NoteRow[] {
  const notes = parsed.noteStarts.map((t, i) => ({ t, col: parsed.columns[i] ?? 0 })).sort((a, b) => a.t - b.t);
  const rows: NoteRow[] = [];
  for (const n of notes) {
    const last = rows[rows.length - 1];
    if (last && last.t === n.t) last.n++;
    else rows.push({ t: n.t, n: 1 });
  }
  return rows;
}

/** 主导行 cadence（照抄 streamClass.rowCadenceClusters：±15% 贪心簇、count≥4、按 count 降序）。 */
function dominantCadence(rows: NoteRow[]): number | null {
  const counts = new Map<number, number>();
  for (let i = 0; i < rows.length - 1; i++) {
    const dt = rows[i + 1]!.t - rows[i]!.t;
    if (dt <= 0 || dt > 1500) continue;
    counts.set(dt, (counts.get(dt) ?? 0) + 1);
  }
  const dts = [...counts.keys()].sort((a, b) => a - b);
  if (!dts.length) return null;
  const clusters: number[][] = [];
  let cur: number[] = [];
  for (const dt of dts) {
    const n = counts.get(dt)!;
    if (cur.length && dt > (cur.reduce((s, v) => s + v, 0) / cur.length) * 1.15) {
      clusters.push(cur);
      cur = [];
    }
    for (let k = 0; k < n; k++) cur.push(dt);
  }
  if (cur.length) clusters.push(cur);
  const dom = clusters.filter((c) => c.length >= 4).sort((a, b) => b.length - a.length)[0];
  if (dom) return dom.reduce((s, v) => s + v, 0) / dom.length;
  // 兜底：无合格簇时取 ≤1500ms 间隔的中位数
  const all: number[] = [];
  for (const dt of dts) for (let k = 0; k < counts.get(dt)!; k++) all.push(dt);
  return all.length ? all[Math.floor(all.length / 2)]! : null;
}

/**
 * WDS 密度（用户规定 2026-10-05）：有效段（>2s 空隙切段）内以主导 cadence 为
 * 节拍基准（1 拍 = 4×C，C = 行距 = effBPM 下 1/4 拍），每 16 拍（4 小节）切一节，
 * 节内 4 行滑窗音符数取均值；图级密度 = 各完整节均值的平均。
 */
function wdsDensity(parsed: ParsedBeatmap): { density: number; p90: number; eff: number; sections: number } | null {
  const rows = buildRows(parsed);
  if (rows.length < 8) return null;
  const C = dominantCadence(rows);
  if (!C) return null;
  const sectionMs = 64 * C;
  const GAP = 2000;
  const segs: Array<{ start: number; end: number }> = [];
  let s = rows[0]!.t;
  let prev = rows[0]!.t;
  for (let i = 1; i < rows.length; i++) {
    const t = rows[i]!.t;
    if (t - prev > GAP) {
      segs.push({ start: s, end: prev });
      s = t;
    }
    prev = t;
  }
  segs.push({ start: s, end: prev });

  const blockMeans: number[] = [];
  for (const seg of segs) {
    const nBlocks = Math.floor((seg.end - seg.start) / sectionMs + 1e-9);
    let lo = 0;
    for (let b = 0; b < nBlocks; b++) {
      const bs = seg.start + b * sectionMs;
      const be = bs + sectionMs;
      while (lo < rows.length && rows[lo]!.t < bs) lo++;
      const inBlock: number[] = [];
      for (let i = lo; i < rows.length && rows[i]!.t < be; i++) inBlock.push(rows[i]!.n);
      if (inBlock.length < 4) continue;
      let sum = 0;
      let cnt = 0;
      for (let i = 0; i + 3 < inBlock.length; i++) {
        sum += inBlock[i]! + inBlock[i + 1]! + inBlock[i + 2]! + inBlock[i + 3]!;
        cnt++;
      }
      if (cnt > 0) blockMeans.push(sum / cnt);
    }
  }
  if (!blockMeans.length) return null;
  const density = blockMeans.reduce((a, b) => a + b, 0) / blockMeans.length;
  if (!Number.isFinite(density) || density <= 0) return null;
  const sorted = [...blockMeans].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(0.9 * (sorted.length - 1))]!;
  return { density, p90, eff: Math.round(15000 / C), sections: blockMeans.length };
}

/** 子弹密度（照抄站方 speedBulletRatio）：同列间隔 ≈ 2C（±4ms，C=主导行距）的
 *  键对涉及音符数 ÷ 有效段（>2s 切段）内音符数。站方 Speed 判定要求 ≤0.05。 */
function bulletRatio(parsed: ParsedBeatmap, bulletC: number): number | null {
  const notes = parsed.noteStarts
    .map((t, i) => ({ t, col: parsed.columns[i] ?? 0 }))
    .filter((n) => n.col >= 0 && n.col <= 3)
    .sort((a, b) => a.t - b.t);
  const rows: Array<{ t: number; cols: number[] }> = [];
  for (const n of notes) {
    const last = rows[rows.length - 1];
    if (last && last.t === n.t) last.cols.push(n.col);
    else rows.push({ t: n.t, cols: [n.col] });
  }
  if (rows.length < 4) return null;
  // 有效段（按行时间切，>2s 空隙切段）
  const GAP = 2000;
  const segs: Array<{ start: number; end: number }> = [];
  let s0 = rows[0]!.t;
  let prev = rows[0]!.t;
  for (const r of rows) {
    if (r.t - prev > GAP) {
      segs.push({ start: s0, end: prev });
      s0 = r.t;
    }
    prev = r.t;
  }
  segs.push({ start: s0, end: prev });
  const inSeg = (t: number) => segs.some((g) => t >= g.start && t <= g.end);
  // 主导行距 C 只在有效段内统计
  const segRows = rows.filter((r) => inSeg(r.t));
  const C = dominantCadence(segRows.map((r) => ({ t: r.t, n: r.cols.length })));
  if (!C) return null;
  const LIMIT = bulletC * C; // 子弹判据：同列间隔 ≤ bulletC×C（齐民要术 2.1.1.1 小间距连续单键）
  let bullets = 0;
  const lastT: Array<number | null> = [null, null, null, null];
  let totalNotes = 0;
  for (const r of rows) {
    if (!inSeg(r.t)) continue;
    totalNotes += r.cols.length;
    for (const c of r.cols) {
      const lt = lastT[c]!;
      if (lt != null && r.t - lt <= LIMIT) bullets++; // 本次重复记一枚子弹（链式可 >100%）
    }
    for (const c of r.cols) lastT[c] = r.t;
  }
  return totalNotes > 0 ? bullets / totalNotes : null;
}

interface SecStats { n: number; dMean: number; dP90: number; dMax: number; bMean: number; bP50: number; bP90: number; bMax: number; }

/** 逐节（effBPM 下 16 拍=4 小节）统计：节内 4 行滑窗密度均值、节内子弹占比
 *  （≤bulletC×C 同列重复 / 节内音符数），聚合出 均/P50/P90/max。 */
function sectionStats(parsed: ParsedBeatmap, bulletC: number): SecStats | null {
  const notes = parsed.noteStarts
    .map((t, i) => ({ t, col: parsed.columns[i] ?? 0 }))
    .filter((n) => n.col >= 0 && n.col <= 3)
    .sort((a, b) => a.t - b.t);
  const rows: Array<{ t: number; cols: number[] }> = [];
  for (const n of notes) {
    const last = rows[rows.length - 1];
    if (last && last.t === n.t) last.cols.push(n.col);
    else rows.push({ t: n.t, cols: [n.col] });
  }
  if (rows.length < 8) return null;
  const GAP = 2000;
  const segs: Array<{ start: number; end: number }> = [];
  let s0 = rows[0]!.t;
  let prev = rows[0]!.t;
  for (const r of rows) {
    if (r.t - prev > GAP) {
      segs.push({ start: s0, end: prev });
      s0 = r.t;
    }
    prev = r.t;
  }
  segs.push({ start: s0, end: prev });
  const inSeg = (t: number) => segs.some((g) => t >= g.start && t <= g.end);
  const segRows = rows.filter((r) => inSeg(r.t));
  const C = dominantCadence(segRows.map((r) => ({ t: r.t, n: r.cols.length })));
  if (!C) return null;
  const sectionMs = 64 * C;
  const LIMIT = bulletC * C;
  const sections: Array<{ start: number; end: number }> = [];
  for (const seg of segs) {
    const nBlocks = Math.floor((seg.end - seg.start) / sectionMs + 1e-9);
    for (let b = 0; b < nBlocks; b++) sections.push({ start: seg.start + b * sectionMs, end: seg.start + (b + 1) * sectionMs });
  }
  if (!sections.length) return null;
  const secOf = (t: number) => {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i]!;
      if (t >= s.start && t < s.end) return i;
    }
    return -1;
  };
  const secNotes = new Array<number>(sections.length).fill(0);
  const secBullets = new Array<number>(sections.length).fill(0);
  const rowsBySec: number[][] = sections.map(() => []);
  for (const r of rows) {
    if (!inSeg(r.t)) continue;
    const si = secOf(r.t);
    if (si < 0) continue;
    secNotes[si]++;
    rowsBySec[si]!.push(r.cols.length);
  }
  const lastT: Array<number | null> = [null, null, null, null];
  for (const r of rows) {
    if (!inSeg(r.t)) continue;
    const si = secOf(r.t);
    if (si < 0) continue;
    for (const c of r.cols) {
      const lt = lastT[c]!;
      if (lt != null && r.t - lt <= LIMIT) secBullets[si]++;
      lastT[c] = r.t;
    }
  }
  const dens: number[] = [];
  const bul: number[] = [];
  sections.forEach((_, i) => {
    const rs = rowsBySec[i]!;
    if (rs.length < 4 || secNotes[i] === 0) return;
    let sum = 0;
    let cnt = 0;
    for (let j = 0; j + 3 < rs.length; j++) {
      sum += rs[j]! + rs[j + 1]! + rs[j + 2]! + rs[j + 3]!;
      cnt++;
    }
    if (!cnt) return;
    dens.push(sum / cnt);
    bul.push(secBullets[i]! / secNotes[i]!);
  });
  if (!dens.length) return null;
  const q = (arr: number[], p: number) => {
    const s2 = [...arr].sort((a, b) => a - b);
    return s2[Math.min(s2.length - 1, Math.floor(p * s2.length))]!;
  };
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    n: dens.length,
    dMean: mean(dens), dP90: q(dens, 0.9), dMax: Math.max(...dens),
    bMean: mean(bul), bP50: q(bul, 0.5), bP90: q(bul, 0.9), bMax: Math.max(...bul),
  };
}

// WDS叠：密度档(S<8/M<10/L<12/H) × 锚值档(F≥1.1/R≥1.09/P)，站方 suggestDetailed 阈值
/** 1 cell 粒度锚值：窗口固定为 1 cell（effBPM 下 16 拍 = 64×C），步长 = 窗长 1/2，
 *  段内滑动、不跨有效段拼接缝（尾窗截断到段尾），单尺度、无 min。 */
function anchor1Cell(parsed: ParsedBeatmap): { anchor: number; meanU: number; ratioHarm: number | null } | null {
  const notes = parsed.noteStarts
    .map((t, i) => ({ t, col: parsed.columns[i] ?? 0 }))
    .filter((n) => n.col >= 0 && n.col <= 3)
    .sort((a, b) => a.t - b.t);
  if (!notes.length) return null;
  const N = notes.length;
  const pc: Uint32Array[] = [0, 1, 2, 3].map(() => new Uint32Array(N + 1));
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 4; c++) pc[c]![i + 1] = pc[c]![i]!;
    pc[notes[i]!.col]![i + 1]++;
  }
  const GAP = 2000;
  const segs: Array<{ start: number; end: number }> = [];
  let s0 = notes[0]!.t;
  let prev = notes[0]!.t;
  for (const n of notes) {
    if (n.t - prev > GAP) {
      segs.push({ start: s0, end: prev });
      s0 = n.t;
    }
    prev = n.t;
  }
  segs.push({ start: s0, end: prev });
  const inSeg = (t: number) => segs.some((g) => t >= g.start && t <= g.end);
  const rows = buildRows(parsed).filter((r) => inSeg(r.t));
  const C = dominantCadence(rows);
  if (!C) return null;
  const w = 64 * C;
  const step = w / 2;
  let sumRecip = 0; // Σ n2/n1（窗口分数 N1/N2 的倒数；n2=0 计 0 → 拉向 ∞）
  let ratioWindows = 0;
  let sumU = 0;
  let cnt = 0;
  let iF = 0;
  let iT = 0;
  for (const seg of segs) {
    for (let from = seg.start; from < seg.end; from += step) {
      const to = Math.min(from + w, seg.end);
      while (iT < N && notes[iT]!.t <= to) iT++;
      while (iF < iT && notes[iF]!.t < from) iF++;
      for (const [c0, c1] of [[0, 1], [2, 3]] as const) {
        const a = pc[c0]![iT]! - pc[c0]![iF]!;
        const b2 = pc[c1]![iT]! - pc[c1]![iF]!;
        const n1 = a > b2 ? a : b2;
        const n2 = a > b2 ? b2 : a;
        sumU += n1 === 0 ? 0 : 1 - Math.abs(n1 - 2 * n2) / n1;
        if (n1 > 0) {
          sumRecip += n1 === 0 ? 0 : n2 / n1;
          ratioWindows++;
        }
        cnt++;
      }
    }
  }
  if (!cnt) return null;
  const meanU = sumU / cnt;
  // 调和平均 N = 1 / mean(1/分数)：全空手窗跳过，全 n2=0 → ∞
  const ratioHarm = ratioWindows === 0 ? null : sumRecip === 0 ? Infinity : ratioWindows / sumRecip;
  return { anchor: 1.135 - 0.06 * meanU, meanU, ratioHarm };
}

const wdsAnchorLetter = (a: number) => (a >= 1.1 ? "M" : a >= 1.09 ? "R" : "T"); // 糊度字母：M=manip 糊键 / R=regular / T=technical 卡手
// 密度位/糊度位 → 词（完整报告用）：S=Low M=Mid L=High H=Full；M=Manip R=Reg T=Tech
const densWord = (l: string) => (l === "S" ? "Low" : l === "M" ? "Mid" : l === "L" ? "High" : "Full");
const manipWord = (l: string) => (l === "M" ? "Manip" : l === "R" ? "Reg" : "Tech");
const jackTier = (d: number, a: number, delta: number | null, tri: number): [string, string] => {
  const mg = tri >= 20 ? "R" : a <= 1.11 && delta != null ? (delta < 0.005 ? "M" : delta > 0.01 ? "T" : "R") : wdsAnchorLetter(a);
  return [d < 8 ? "S" : d < 10 ? "M" : d < 12 ? "L" : "H", mg]; // d = 节密度P90×锚值
};
const wdsJackType = (d: number, a: number, delta: number | null, tri: number) => {
  const [x, y] = jackTier(d, a, delta, tri);
  return `${x}${y}-Jack`;
};
// 锚档试行（2026-10-05 用户约束）：A≤1.11 用 deltaA 定档（<0.005 M / >0.01 T / 其余 R）；
// A>1.11 待定——候选量 = 热点占比（U≥0.8 窗频率）+ 获胜窗音符数闸门
const condAnchorGrade = (a: number, delta: number | null) => {
  if (delta == null) return "—";
  if (a > 1.11) return "待定";
  return delta < 0.005 ? "M" : delta > 0.01 ? "T" : "R";
};
// WDS切：3C 节弹P50（2026-10-05：<40 S-Stream / <75 M-Stream / <110 L-Stream / ≥110 H-Stream）
// 切：密度=3C 节弹P50（<40 S / <75 M / <110 L / ≥110 H），糊度=节锁2覆盖率（<35 F / <60 R / ≥60 P）
const streamTier = (p50: number, cov: number): [string, string] => [
  p50 < 0.4 ? "S" : p50 < 0.75 ? "M" : p50 < 1.1 ? "L" : "H",
  cov < 35 ? "M" : cov < 60 ? "R" : "T",
];
const wdsStreamType = (p50: number, cov: number) => {
  const [x, y] = streamTier(p50, cov);
  return `${x}${y}-Stream`;
};
// 糊度试行（2026-10-05）：lock2 单量；stamina 线 18/36、speed 线 8.5/21（评级夹逼：F/R∈(14.2,21.9]、R/P∈(34.7,36.6]）
// jack/stream 不评（jack 用邻跳，线待补）
// jack 糊度 = 邻跳占比（F≥68 / R 40–68 / P<40，评级线：LastChance 35 / CTME 42 / Chocolate 67 / Platinum 68 / Don'tStop 72）；
// 三押占比 ≥20% 是 handstream 混合体 → 标 hand 出局（Umiyuri 型）
const manipGrade = (family: string, lock2: number, adj: number, tri: number, cov: number) =>
  family === "stamina" ? (lock2 < 18 ? "M" : lock2 < 36 ? "R" : "T")
    : family === "speed" ? (lock2 < 8.5 ? "M" : lock2 < 21 ? "R" : "T")
    : family === "jack" ? (tri >= 20 ? "R" : adj < 40 ? "T" : adj < 68 ? "R" : "M")
    : family === "stream" ? (cov < 35 ? "M" : cov < 60 ? "R" : "T")
    : "—";
// WDS乱：节密度P90 单量分档（2026-10-05 用户定版，不用类标签门槛——tech 低密度自然落 S）：
//   L-Speed：P90 ≥ 9.04（reg10speed Yue Ai Yue Ye 全节口径）
//   M-Speed：7.02 ≤ P90 < 9.04（S/M 边界 = rf9speed 5.00 与 reg10 9.04 的平均；reg6 6.62 旁证）
//   S-Speed：P90 < 7.02
const SPEED_M_LINE = 7.02;
const SPEED_L_LINE = 9.04;
// 乱：密度=节密度P90（S<7.02 / M<9.04 / L），糊度=lock2（<8.5 F / <21 R / ≥21 P），trill 旗标另加
const speedTier = (p90: number, lock2: number): [string, string] => [
  p90 >= SPEED_L_LINE ? "L" : p90 >= SPEED_M_LINE ? "M" : "S",
  lock2 < 8.5 ? "M" : lock2 < 21 ? "R" : "T",
];
const wdsSpeedType = (p90: number, lock2: number) => {
  const [x, y] = speedTier(p90, lock2);
  return `${x}${y}-Speed`;
};

const wdsJackTier = (d: number) => (d < 8 ? "小叠" : d < 10 ? "中叠" : d < 12 ? "大叠" : "满叠");
const wdsStreamTier = (d: number) => (d < 4.75 ? "—" : d < 6 ? "稀切" : d < 7 ? "中切" : d < 7.5 ? "高切" : "满切");
const wdsSpeedTier = (d: number) => (d < 8 ? "单押" : d < 8.5 ? "稀疏" : d < 9.5 ? "稠密" : "—");

// ---------------------------------------------------------------------------
// 锚值 A / 锚度 meanU —— 照抄站方 spike.js（alpha 默认路径，未校准系数照搬）
//   U = 1 − |max−2·min| / max（空手 0，峰值在 2:1）
//   A_combo = 1.135 − 0.06 × meanU_combo；A = min over divisor 16..1024 × step {2,4,8,16}
// ---------------------------------------------------------------------------

function imbalance(a: number, b: number): number {
  const n1 = Math.max(a, b);
  const n2 = Math.min(a, b);
  return n1 === 0 ? 0 : 1 - Math.abs(n1 - 2 * n2) / n1;
}

// 锁定度（2026-10-05）：同列间隔按主导 cadence 分桶，lock1=k1（连打/jack 专属），
// lock2=k2（交替锁定，单点系糊度轴）；adj=双押行中相邻列占比（chordjack 糊度轴）
function lockMetrics(parsed: ParsedBeatmap): { lock1: number; lock2: number; adj: number; tri: number; cov: number } {
  const byT = new Map<number, boolean[]>();
  for (let i = 0; i < parsed.noteStarts.length; i++) {
    const c = parsed.columns[i] ?? 0;
    if (c < 0 || c > 3) continue;
    let a = byT.get(parsed.noteStarts[i]!);
    if (!a) byT.set(parsed.noteStarts[i]!, a = [false, false, false, false]);
    a[c] = true;
  }
  const rows = [...byT].sort((x, y) => x[0] - y[0]).map(([t, a]) => ({ t, a, n: a.filter(Boolean).length }));
  const C = dominantCadence(rows);
  if (!C) return { lock1: 0, lock2: 0, adj: -1, tri: 0, cov: 0 };
  // 覆盖率：节锁2≥35% 的完整节占比（stream 系糊度轴，局部化自动降档）
  const sectionMs = 64 * C;
  const segs: Array<{ s: number; e: number }> = [];
  {
    let s0 = rows[0]!.t, prev = rows[0]!.t;
    for (const r of rows) {
      if (r.t - prev > 2000) { segs.push({ s: s0, e: prev }); s0 = r.t; }
      prev = r.t;
    }
    segs.push({ s: s0, e: prev });
  }
  let covN = 0, covHit = 0;
  for (const seg of segs) {
    const nB = Math.floor((seg.e - seg.s) / sectionMs + 1e-9);
    for (let b = 0; b < nB; b++) {
      const bs = seg.s + b * sectionMs, be = bs + sectionMs;
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
      const den = bu[0]! + bu[1]! + bu[2]! + bu[3]! + bu[4]!;
      if (den < 8) continue;
      covN++;
      if (100 * bu[1]! / den >= 35) covHit++;
    }
  }
  const cov = covN ? 100 * covHit / covN : 0;
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
  const denom = bucket[0]! + bucket[1]! + bucket[2]! + bucket[3]! + bucket[4]!;
  let dbl = 0, adjN = 0, tri = 0, single = 0;
  for (const r of rows) {
    if (r.n === 0) continue;
    const cs = r.a.map((v, j) => (v ? j : -1)).filter((j) => j >= 0);
    if (r.n === 1) single++;
    else if (r.n === 2) {
      dbl++;
      if (Math.abs(cs[0]! - cs[1]!) === 1) adjN++;
    } else tri++;
  }
  return {
    lock1: denom ? 100 * bucket[0]! / denom : 0,
    lock2: denom ? 100 * bucket[1]! / denom : 0,
    adj: dbl ? 100 * adjN / dbl : -1,
    tri: single + dbl + tri ? 100 * tri / (single + dbl + tri) : 0,
    cov,
  };
}

function spikeAnchor(parsed: ParsedBeatmap, stepDivisors: number[] = [2, 4, 8, 16]): { anchor: number; meanU: number; ratioHarm: number | null; hotN: number | null; hotRatio: number | null; rVar: number | null } | null {
  const notes = parsed.noteStarts
    .map((t, i) => ({ time: t, column: parsed.columns[i] ?? 0 }))
    .filter((n) => n.column >= 0 && n.column <= 3)
    .sort((a, b) => a.time - b.time);
  if (!notes.length) return null;
  const GAP = 2000;
  const segs: Array<{ start: number; end: number }> = [];
  let s = notes[0]!.time;
  let prev = notes[0]!.time;
  for (const n of notes) {
    if (n.time - prev > GAP) {
      segs.push({ start: s, end: prev });
      s = n.time;
    }
    prev = n.time;
  }
  segs.push({ start: s, end: prev });
  // 拼接有效段 → typed arrays（时间重定基）
  const times: number[] = [];
  const cols: number[] = [];
  let duration = 0;
  for (const seg of segs) {
    for (const n of notes) {
      if (n.time < seg.start) continue;
      if (n.time > seg.end) break;
      times.push(duration + (n.time - seg.start));
      cols.push(n.column);
    }
    duration += seg.end - seg.start;
  }
  const N = times.length;
  if (!N || duration <= 0) return null;
  // 每列前缀计数：pc[c][i] = 前 i 个音符中 c 列的个数
  const pc: Uint32Array[] = [0, 1, 2, 3].map(() => new Uint32Array(N + 1));
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 4; c++) pc[c]![i + 1] = pc[c]![i]!;
    pc[cols[i]!]![i + 1]++;
  }
  const divisors = Array.from({ length: 1009 }, (_, i) => i + 16);
  let minAnchor = Infinity;
  let minMeanU = 0;
  let minRatioHarm: number | null = null;
  let minHotN: number | null = null;
  let minHotRatio: number | null = null;
  let minRVar: number | null = null;
  for (const divisor of divisors) {
    for (const stepDivisor of stepDivisors) {
      const windowMs = duration / divisor;
      const stepMs = windowMs / stepDivisor;
      const steps = (divisor - 1) * stepDivisor;
      let sumU = 0;
      let sampleCount = 0;
      let iFrom = 0;
      let iTo = 0;
      let sumRecip = 0;
      let ratioWindows = 0;
      let hotSumRecip = 0; // U≥0.8 热点窗：锚纹理的直接测量
      let hotCount = 0;
      let rSumSq = 0; // r=n2/n1 的 Σr²，算 Var(1/N_w) 用
      for (let j = 0; j <= steps; j++) {
        const from = j * stepMs;
        const to = j === steps ? duration : from + windowMs;
        while (iTo < N && times[iTo]! <= to) iTo++;
        while (iFrom < iTo && times[iFrom]! < from) iFrom++;
        const c0 = pc[0]![iTo]! - pc[0]![iFrom]!;
        const c1 = pc[1]![iTo]! - pc[1]![iFrom]!;
        const c2 = pc[2]![iTo]! - pc[2]![iFrom]!;
        const c3 = pc[3]![iTo]! - pc[3]![iFrom]!;
        // imbalance 内联：U = 1 − |max−2·min|/max，空手 0
        let n1 = c0 > c1 ? c0 : c1;
        let n2 = c0 > c1 ? c1 : c0;
        let u = n1 === 0 ? 0 : 1 - Math.abs(n1 - 2 * n2) / n1;
        sumU += u;
        if (n1 > 0) {
          sumRecip += n2 / n1;
          rSumSq += (n2 / n1) ** 2;
          ratioWindows++;
          if (u >= 0.8) {
            hotSumRecip += n2 / n1;
            hotCount++;
          }
        }
        n1 = c2 > c3 ? c2 : c3;
        n2 = c2 > c3 ? c3 : c2;
        u = n1 === 0 ? 0 : 1 - Math.abs(n1 - 2 * n2) / n1;
        sumU += u;
        if (n1 > 0) {
          sumRecip += n2 / n1;
          rSumSq += (n2 / n1) ** 2;
          ratioWindows++;
          if (u >= 0.8) {
            hotSumRecip += n2 / n1;
            hotCount++;
          }
        }
        sampleCount += 2;
      }
      const meanU = sumU / sampleCount;
      const anchor = 1.135 - 0.06 * meanU;
      const ratioHarm = ratioWindows === 0 ? null : sumRecip === 0 ? Infinity : ratioWindows / sumRecip;
      const hotN = hotCount === 0 ? null : hotSumRecip === 0 ? Infinity : hotCount / hotSumRecip;
      const hotRatio = ratioWindows === 0 ? null : hotCount / ratioWindows;
      // Var(1/N) = E[r²] − E[r]²（r = n2/n1）
      const rVar = ratioWindows === 0 ? null : rSumSq / ratioWindows - (sumRecip / ratioWindows) ** 2;
      if (anchor < minAnchor) {
        minAnchor = anchor;
        minMeanU = meanU;
        minRatioHarm = ratioHarm;
        minHotN = hotN;
        minHotRatio = hotRatio;
        minRVar = rVar;
      }
    }
  }
  return Number.isFinite(minAnchor) ? { anchor: minAnchor, meanU: minMeanU, ratioHarm: minRatioHarm, hotN: minHotN, hotRatio: minHotRatio, rVar: minRVar } : null;
}

interface Row {
  name: string;
  bpm: number | null;
  dan: number;
  density: number;
  p90: number;
  eff: number | null;
  sections: number;
  anchor: number | null;
  meanU: number | null;
  aCond: number | null;
  rAll: number | null;
  rCell: number | null;
  hotN: number | null;
  hotRatio: number | null;
  lock1: number;
  lock2: number;
  adj: number;
  tri: number;
  cov: number;
  rVar: number | null;
  b2: SecStats | null;
  b3: SecStats | null;
  b4: SecStats | null;
  jack: string;
  stream: string;
}

async function main() {
  const { OsuFileParser } = await import("../src/parser/osuFileParser.js");
  const { computeJackClass } = await import("../src/custom/jackClass.js");
  const { computeStreamClass } = await import("../src/custom/streamClass.js");

  const report: string[] = [
    "# WDS 密度档对照 — reform/regular dans",
    "",
    "密度单位 = 本仓 jack density（4 行滑窗音符数）。计算：有效段（>2s 空隙切段）内，",
    "以主导行 cadence（effBPM）为节拍基准，每 16 拍（4 小节）切一节，节内 4 行滑窗",
    "音符数取均值，图级密度 = 各完整节均值的平均（锚值补正未乘）。",
    "段位：reform 1st..10th=1..10, Alpha..Epsilon=11..15；regular Reg-1..10=1..10, Reg-0=0, Ex-1..9=11..19, Ex-Final=20。",
    "",
  ];

  const REPORT_FULL_PATH = path.join("test", "wdsFullTables.report.md");
  const reportFull: string[] = [
    "# WDS 完整标记表 — 8 组全段位",
    "",
    "格式：`密度-糊度-词`，如 Low-Manip-Jack / Full-Tech-Stream。密度 S=Low M=Mid L=High H=Full；",
    "糊度 M=Manip（糊键）R=Reg（一般）T=Tech（卡手）。叠糊度=deltaA 线（hand 三押≥20% 强制 Reg），",
    "切糊度=节锁2≥35% 覆盖率，乱糊度=lock2（trill? = P90<7.02 且锁2≥50）。",
    "",
  ];
  let totalRows = 0;
  let fullRows = 0;
  for (const g of GROUPS) {
    const dir = path.join(MAPS_ROOT, g.dir);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".osu")).sort();
    if (!files.length) throw new Error(`目录没有 .osu: ${g.dir}`);

    const rows: Row[] = [];
    const skipped: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const parser = new OsuFileParser(text);
      parser.process();
      const parsed = parser.getParsedData();
      if (parsed.gameMode !== 3 || parsed.columnCount !== 4) {
        skipped.push(`${f} (mode=${parsed.gameMode}, keys=${parsed.columnCount})`);
        continue;
      }
      const jack = computeJackClass(parsed, 1);
      const stream = computeStreamClass(parsed, 1);
      const wd = wdsDensity(parsed);
      const sp = spikeAnchor(parsed);
      const aCond = anchor1Cell(parsed);
      const b2 = sectionStats(parsed, 2);
      const b3 = sectionStats(parsed, 3);
      const b4 = sectionStats(parsed, 4);
      const lk = lockMetrics(parsed);
      rows.push({
        name: shortName(f, g.dir),
        bpm: dominantBpm(parsed),
        dan: danNumber(f, g.dir),
        density: wd?.density ?? NaN,
        p90: wd?.p90 ?? NaN,
        eff: wd?.eff ?? null,
        sections: wd?.sections ?? 0,
        anchor: sp?.anchor ?? null,
        aCond: aCond?.anchor ?? null,
        rAll: sp?.ratioHarm ?? null,
        rCell: aCond?.ratioHarm ?? null,
        hotN: sp?.hotN ?? null,
        hotRatio: sp?.hotRatio ?? null,
        lock1: lk.lock1,
        lock2: lk.lock2,
        adj: lk.adj,
        tri: lk.tri,
        cov: lk.cov,
        rVar: sp?.rVar ?? null,
        meanU: sp?.meanU ?? null,
        b2,
        b3,
        b4,
        jack: jack.className,
        stream: stream.className,
      });
    }
    if (skipped.length) console.log(`[${g.label}] 跳过非 4K: ${skipped.join("; ")}`);
    if (!rows.length) throw new Error(`目录全部被跳过: ${g.dir}`);

    rows.sort((a, b) => a.dan - b.dan || a.name.localeCompare(b.name));
    totalRows += g.dir.includes("tech") ? 0 : rows.length;
    fullRows += 0;

    if (!g.dir.includes("tech")) {
      report.push(`## ${g.label}（${g.dir}，${rows.length} 张，段位<11）`, "");
    }
    reportFull.push(`## ${g.label}（${g.dir}，${rows.length} 张）`, "");
    reportFull.push("| 谱面 | eff | 密度 | 密度P90 | 本仓Jack主导 | 本仓Stream主导 | WDS叠 | WDS切 | WDS乱 |");
    reportFull.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    report.push("N = 逐窗分数 N1/N2（1:1→1、2:1→2、纯单指→∞）的调和平均 = 1/mean(N2/N1)；空手窗跳过，n2=0 窗倒数计 0（拉向 ∞）。N(全步)=min-A 获胜组合；N(1cell)=16 拍节窗。");
    report.push("");
    report.push("| 谱面 | 段位 | N全步 | 糊度 | Var(1/N) | 1/Var | N热(U≥0.8) | 热点占比 | N1cell | meanU全步 |");
    report.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    const isTech = g.dir.includes("tech");
    const fmtN = (v: number | null) => (v == null ? "—" : Number.isFinite(v) ? v.toFixed(2) : "∞");
    // 糊度 = 0.5 − max(N−1, 2−N)：N=1.5 处 0（最糊），→1 或 →2 降到 −0.5（干净纹理）
    const midTent = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : (0.5 - Math.max(v - 1, 2 - v)).toFixed(2));
    if (!isTech) {
      for (const r of rows) {
        if (r.dan >= 11) continue;
        if (!r.aCond || r.anchor == null) throw new Error(`统计失败: ${r.name}`);
        const u1 = (1.135 - r.anchor) / 0.06;
        report.push(
          `| ${r.name} | ${r.dan} | ${fmtN(r.rAll)} | ${midTent(r.rAll)} | ${r.rVar == null ? "—" : r.rVar.toFixed(3)} | ${r.rVar != null && r.rVar > 0 ? (1 / r.rVar).toFixed(1) : "—"} | ${fmtN(r.hotN)} | ${r.hotRatio == null ? "—" : (r.hotRatio * 100).toFixed(0) + "%"} | ${fmtN(r.rCell)} | ${u1.toFixed(3)} |`
        );
      }
      report.push("");
      report.push("| 谱面 | eff | 段位 | 密度 | 密度P90 | P90×A | 锚值A(全步) | 锚值A(1cell) | Δ | meanU | 热点占比 | 锚档试行 | 锁1 | 锁2 | 邻跳 | 糊度试行 | 本仓Jack主导 | 本仓Stream主导 | WDS叠 | WDS切 | WDS乱 | 弹P50@2C | 弹P50@3C |");
      report.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    }
    for (const r of rows) {
      if (!r.b2 || !r.b3 || !r.b4 || r.anchor == null) throw new Error(`统计失败: ${r.name}`);
      const [jd, jm] = jackTier(r.p90 * r.anchor, r.anchor, r.aCond != null && r.anchor != null ? r.aCond - r.anchor : null, r.tri);
      const [sd, sm] = streamTier(r.b3.bP50, r.cov);
      const [pd, pm] = speedTier(r.p90, r.lock2);
      reportFull.push(
        `| ${r.name} | ${r.eff ?? "—"} | ${r.density.toFixed(2)} | ${r.p90.toFixed(2)} | ${r.jack} | ${r.stream} | ${densWord(jd)}-${manipWord(jm)}-Jack | ${densWord(sd)}-${manipWord(sm)}-Stream | ${densWord(pd)}-${manipWord(pm)}-Speed${r.p90 < SPEED_M_LINE && r.lock2 >= 50 ? " trill?" : ""} |`
      );
      fullRows++;
      if (isTech || r.dan >= 11) continue;
      report.push(
        `| ${r.name} | ${r.eff ?? "—"} | ${r.dan} | ${r.density.toFixed(2)} | ${r.p90.toFixed(2)} | ${(r.p90 * r.anchor).toFixed(2)} | ${r.anchor.toFixed(4)} | ${r.aCond?.toFixed(4) ?? "—"} | ${(r.aCond != null && r.anchor != null ? (r.aCond - r.anchor).toFixed(4) : "—")} | ${((1.135 - r.anchor) / 0.06).toFixed(3)} | ${r.hotRatio == null ? "—" : (r.hotRatio * 100).toFixed(0) + "%"} | ${condAnchorGrade(r.anchor, r.aCond != null && r.anchor != null ? r.aCond - r.anchor : null)} | ${r.lock1.toFixed(1)}% | ${r.lock2.toFixed(1)}% | ${r.adj < 0 ? "—" : r.adj.toFixed(0) + "%"} | ${manipGrade(g.dir.includes("speed") ? "speed" : g.dir.includes("stamina") ? "stamina" : g.dir.includes("jack") ? "jack" : "stream", r.lock2, r.adj, r.tri, r.cov)} | ${r.jack} | ${r.stream} | ${wdsJackType(r.p90 * r.anchor, r.anchor, r.aCond != null && r.anchor != null ? r.aCond - r.anchor : null, r.tri)} | ${wdsStreamType(r.b3.bP50, r.cov)} | ${wdsSpeedType(r.p90, r.lock2)}${r.p90 < SPEED_M_LINE && r.lock2 >= 50 ? " trill?" : ""} | ${(r.b2.bP50 * 100).toFixed(1)}% | ${(r.b3.bP50 * 100).toFixed(1)}% |`
      );
    }
    report.push("");
  }

  report.push(`共 ${totalRows} 张谱面，6 组 12 表（紧凑字母版，段位<11）。`);
  reportFull.push("", `共 ${fullRows} 张谱面，8 组 8 表（完整词组版）。`);
  fs.writeFileSync(REPORT_FULL_PATH, reportFull.join("\n"), "utf8");
  console.log(`完整表已写入 ${REPORT_FULL_PATH}`);
  fs.writeFileSync(REPORT_PATH, report.join("\n"), "utf8");
  console.log(report.join("\n"));
  console.log(`\n报告已写入 ${REPORT_PATH}`);
}

main();
