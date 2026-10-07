// ============================================================
// WDS0-like marker — 大勿段式三轴标记（叠 Jack / 切 Stream / 乱 Speed）
// 口径与 test/wdsGuideContrast.test.ts 一致（用户 2026-10-06 定稿）：
//   锚值 = 手册 4.1.2.1 链式生长（t 网格 L/16..L/1024、步 {t/16,t/8,t/4}、调和权重 ΣC=-0.06），
//          另算 spike-min（站方滑窗 min-A）作 delta 基准。
//   图级 family：锁1≥10% = 主 jack。主 jack 图叠池=全部节；主 stream 图切池=全部节；
//   节级抽取（同列≤2C 重复对 ≥12% = 叠段）仅用于跨族轴。
//   叠：密度 = 叠池 P90 对照 S<8/M[8,10)/L[10,12)/H≥12；糊度 = delta=链式A−spike-min
//       （<0.005 F / >0.01 P / 其余 R）；hand（三押≥20% 行，分母=全部行）= Gults → R + -W
//   切：密度 = Stream 池 P90 对照 B<4.75（碎）/S[4.75,6)/M[6,7)/L[7,7.5)/H≥7.5；
//       糊度 = 链式A 直套 PDF 阈值（F≥1.11/R[1.1,1.11)/P<1.1）
//   乱：密度 = Stream 段 P50 ×2 对照 S<8+1/256/M<8.5/L<9.5，≥9.5 → 前缀 O（FRP 不显示）；
//       糊度 = Stream 段每节弹对计数档（≤1/16 F / (1/16,1] R / (1,3] P / >3 P）；
//       旗标 T（麻花：计数>3）/ W（构造：≤1/16 且 A<1.115）后置
//   Stream 段 = 非叠段且节内行距中位数 ∈ [0.85,1.15]×C（半速叠段、倍速单点段均不入池）
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";

export interface WdsMarker {
  /** "MR-Jack-W" 样式；"—" = 无法计算 */
  jack: string;
  /** "MR-Stream" 样式 */
  stream: string;
  /** "SR-Speed" / "O-Speed-W" 样式 */
  speed: string;
}

const SPEED_S_LINE = 8 + 1 / 256;

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

/** 帐篷失衡 U = 1 − |max−2·min|/max（空手 0） */
function tent(max: number, min: number): number {
  return max === 0 ? 0 : 1 - Math.abs(max - 2 * min) / max;
}

const densBand = (d: number) => (d < 8 ? "S" : d < 10 ? "M" : d < 12 ? "L" : "H");
const streamBand = (d: number) => (d < 4.75 ? "B" : d < 6 ? "S" : d < 7 ? "M" : d < 7.5 ? "L" : "H");
const speedBand = (d: number) => (d < SPEED_S_LINE ? "S" : d < 8.5 ? "M" : d < 9.5 ? "L" : "—");
const rawJackLetter = (a: number) => (a >= 1.1 ? "F" : a >= 1.09 ? "R" : "P");
const streamLetter = (a: number) => (a >= 1.11 ? "F" : a >= 1.1 ? "R" : "P");
/** 叠糊度：delta 线；hand（三押≥20%，分母=全部行）= Gults → R + W 旗标 */
const jackMush = (a: number, delta: number | null, tri: number): [string, string] => {
  if (tri >= 0.2) return ["R", "W"];
  if (a > 1.11 || delta == null) return [rawJackLetter(a), ""];
  return [delta < 0.005 ? "F" : delta > 0.01 ? "P" : "R", ""];
};
/** 乱糊度：Stream 段每节弹对计数档 + T/W 旗标 */
const speedMush = (a: number, bullet: number): [string, string] => {
  let flag = "";
  if (bullet > 3) flag = "T";
  else if (bullet <= 1 / 16 && a < 1.115) flag = "W";
  const letter = bullet > 1 / 16 && bullet <= 1 ? "R" : bullet > 1 ? "P" : "F";
  return [letter, flag];
};

export function computeWdsMarker(parsed: ParsedBeatmap): WdsMarker {
  const empty: WdsMarker = { jack: "—", stream: "—", speed: "—" };
  if (parsed.noteStarts.length < 8) return empty;
  const rows = buildRows(parsed);
  const C = dominantCadence(rows);
  if (!C) return empty;
  const segs = splitSegments(rows);
  if (!segs.length) return empty;

  // 音符时间/列前缀计数（绝对时间）
  const times: number[] = [], cols: number[] = [];
  for (const [ss, ee] of segs) {
    for (const r of rows) {
      if (r.t < ss || r.t > ee) continue;
      for (let c = 0; c < 4; c++) if (r.a[c]) { times.push(r.t); cols.push(c); }
    }
  }
  const N = times.length;
  if (!N) return empty;
  const pc: Uint32Array[] = [0, 1, 2, 3].map(() => new Uint32Array(N + 1));
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 4; c++) pc[c]![i + 1] = pc[c]![i]!;
    const ci = cols[i]!;
    pc[ci]![i + 1] = pc[ci]![i + 1]! + 1;
  }

  // 链式锚值 A（手册 4.1.2.1）+ spike-min 锚值（delta 基准）
  let chainA = Infinity;
  {
    let wSumU = 0, wSum = 0;
    for (const [ss, ee] of segs) {
      const L = ee - ss;
      if (L <= 0) continue;
      for (const tDiv of [16, 32, 64, 128, 256, 512, 1024]) {
        const t = L / tDiv;
        for (const stepDiv of [16, 8, 4]) {
          const s = t / stepDiv;
          let chainSumU = 0, chainH = 0, idx = 0;
          let lo = 0, hi = 0;
          for (let T = ss; T + t <= ee + 1e-9; T += s) {
            const from = T, to = T + t;
            while (hi < N && times[hi]! <= to) hi++;
            while (lo < hi && times[lo]! < from) lo++;
            idx++;
            chainH += 1 / idx;
            for (const [a, b] of [[0, 1], [2, 3]] as const) {
              const c0 = pc[a]![hi]! - pc[a]![lo]!, c1 = pc[b]![hi]! - pc[b]![lo]!;
              chainSumU += tent(Math.max(c0, c1), Math.min(c0, c1)) / idx;
            }
          }
          wSumU += chainSumU;
          wSum += chainH;
        }
      }
    }
    chainA = wSum > 0 ? 1.135 - 0.06 * (wSumU / wSum) : Infinity;
  }
  let aSpike = Infinity;
  {
    const rt: number[] = [];
    let dur = 0;
    for (const [ss, ee] of segs) {
      for (const r of rows) {
        if (r.t < ss || r.t > ee) continue;
        rt.push(dur + (r.t - ss));
      }
      dur += ee - ss;
    }
    const rtN = rt.length;
    for (let d = 16; d <= 1024; d++) {
      const wMs = dur / d, stMs = wMs / 2, steps = (d - 1) * 2;
      let sumU = 0, cnt = 0, iF = 0, iT = 0;
      for (let j = 0; j <= steps; j++) {
        const from = j * stMs, to = j === steps ? dur : from + wMs;
        while (iT < rtN && rt[iT]! <= to) iT++;
        while (iF < iT && rt[iF]! < from) iF++;
        for (const [a, b] of [[0, 1], [2, 3]] as const) {
          const c0 = pc[a]![iT]! - pc[a]![iF]!, c1 = pc[b]![iT]! - pc[b]![iF]!;
          sumU += tent(Math.max(c0, c1), Math.min(c0, c1));
          cnt++;
        }
      }
      aSpike = Math.min(aSpike, 1.135 - 0.06 * (sumU / cnt));
    }
  }
  if (!Number.isFinite(chainA)) return empty;
  const delta = Number.isFinite(aSpike) ? chainA - aSpike : null;

  // 分节：密度、叠/Stream 段分类、弹对
  const sectionMs = 64 * C;
  const means: number[] = [], jackMeans: number[] = [], streamMeans: number[] = [], streamBullets: number[] = [];
  for (const [ss, ee] of segs) {
    const nB = Math.floor((ee - ss) / sectionMs + 1e-9);
    for (let b = 0; b < nB; b++) {
      const bs = ss + b * sectionMs, be = bs + sectionMs;
      const inB = rows.filter((r) => r.t >= bs && r.t < be);
      if (inB.length < 4) continue;
      let sum = 0, cN = 0;
      for (let i = 0; i + 3 < inB.length; i++) {
        sum += inB[i]!.n + inB[i + 1]!.n + inB[i + 2]!.n + inB[i + 3]!.n;
        cN++;
      }
      if (!cN) continue;
      const dens = sum / cN;
      means.push(dens);
      const notes = inB.reduce((s2, r) => s2 + r.n, 0);
      const ct: number[][] = [[], [], [], []];
      for (const r of inB) for (let c = 0; c < 4; c++) if (r.a[c]) ct[c]!.push(r.t);
      let pairs = 0;
      for (const arr of ct) for (let i = 1; i < arr.length; i++) if (arr[i]! - arr[i - 1]! <= 2 * C) pairs++;
      const gapsS: number[] = [];
      for (let i = 1; i < inB.length; i++) gapsS.push(inB[i]!.t - inB[i - 1]!.t);
      gapsS.sort((a, b) => a - b);
      const localC = gapsS.length ? gapsS[Math.floor(gapsS.length / 2)]! : C;
      if (notes > 0 && pairs >= 0.12 * notes) {
        jackMeans.push(dens);
      } else if (localC >= C * 0.85 && localC <= C * 1.15) {
        streamMeans.push(dens);
        streamBullets.push(pairs);
      }
    }
  }
  if (!means.length) return empty;
  const q = (arr: number[], fb: number[], p: number) => {
    const a2 = [...(arr.length ? arr : fb)].sort((x, y) => x - y);
    return a2[Math.floor(p * (a2.length - 1))]!;
  };
  const p50Stream = q(streamMeans, means, 0.5);
  const sb = [...streamBullets].sort((a, b) => a - b);
  const bP50 = sb.length ? sb[Math.floor(sb.length / 2)]! : 0;

  // 图级 family：锁1≥10% = 主 jack
  let k1 = 0, kTot = 0;
  for (let col = 0; col < 4; col++) {
    const ts = rows.filter((r) => r.a[col]).map((r) => r.t);
    for (let i = 1; i < ts.length; i++) {
      const dt = ts[i]! - ts[i - 1]!;
      if (dt <= 0 || dt > 16 * C) continue;
      kTot++;
      if (Math.abs(dt - C) <= C * 0.15) k1++;
    }
  }
  const isJackChart = kTot > 0 && k1 / kTot >= 0.1;

  // 池路由：主 jack 图叠池=全部节；主 stream 图切池=全部节（与测试表一致）
  const jackPool = isJackChart ? means : jackMeans;
  const streamPool = isJackChart ? streamMeans : means;

  // 三押行占比（分母=全部行）
  let nRowsAll = 0, nRows3 = 0;
  for (const r of rows) {
    if (r.n >= 1) nRowsAll++;
    if (r.n >= 3) nRows3++;
  }
  const tri = nRowsAll ? nRows3 / nRowsAll : 0;

  const jD = densBand(q(jackPool, means, 0.9));
  const [jL, jFlag] = jackMush(chainA, delta, tri);
  const sD = streamBand(q(streamPool, means, 0.9));
  const sL = streamLetter(chainA);
  const pRaw = p50Stream * 2; // 乱池恒为 Stream 段（跨族轴）
  const pOut = pRaw >= 9.5;
  const pD = pOut ? "O" : speedBand(pRaw);
  const [pL, pFlag] = speedMush(chainA, bP50);

  return {
    jack: `${jD}${jL}-Jack${jFlag ? "-" + jFlag : ""}`,
    stream: `${sD}${sL}-Stream`,
    speed: pOut ? `O-Speed${pFlag ? "-" + pFlag : ""}` : `${pD}${pL}-Speed${pFlag ? "-" + pFlag : ""}`,
  };
}
