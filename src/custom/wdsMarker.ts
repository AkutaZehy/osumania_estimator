// ============================================================
// wds0-like marker — the three-axis wds0 Dan marker (jack / stream / speed)
// Calibration matches test/wdsGuideContrast.test.ts (fixed 2026-10-06):
//   anchor = guide 4.1.2.1 chain growth (t grid L/16..L/1024, steps {t/16,t/8,t/4},
//            harmonic weight sum C=-0.06), plus a spike-min anchor (the site's
//            sliding min-A) used as the delta baseline.
//   chart family: lock1 >= 10% = main jack. Main-jack charts use the whole chart as
//   the jack pool, main-stream charts use the whole chart as the stream pool;
//   section extraction (same-column repeats <= 2C at >= 12% = jack section) feeds
//   the cross-family axes only.
//   Jack: density = jack pool P90 against S<8 / M[8,10) / L[10,12) / H>=12;
//         manip = delta = chain A - spike-min
//         (<0.005 F / >0.01 P / the rest R); hand rule (3+ rows >= 20% of all rows)
//         = Gluts -> R + the -W suffix
//   Stream: density = stream pool P90 against B<4.75 (broken) / S[4.75,6) / M[6,7)
//           / L[7,7.5) / H>=7.5; manip = chain A against the PDF thresholds
//           (F>=1.11 / R[1.1,1.11) / P<1.1)
//   Speed: density = stream-section P50 x2 against S<8+1/256 / M<8.5 / L<9.5;
//          >= 9.5 gets the O prefix and no F/R/P letter; manip = per-section bullet
//          count band (<=1/16 F / (1/16,1] R / (1,3] P / >3 P); suffixes
//          T (twist: count > 3) and W (constructed: <= 1/16 and A < 1.115)
//   Stream section = a non-jack section whose median row spacing lies in
//   [0.85,1.15] x C (half-speed jack sections and double-speed single-note
//   sections never enter a pool)
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";

export interface WdsMarker {
  /** "MR-Jack-W" form; "—" = not computable */
  jack: string;
  /** "MR-Stream" form */
  stream: string;
  /** "SR-Speed" / "O-Speed-W" form */
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

/** Dominant row cadence: greedy +/-15% clusters, largest cluster with count>=4 */
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

/** Tent imbalance U = 1 - |max-2*min|/max (0 for an empty hand) */
function tent(max: number, min: number): number {
  return max === 0 ? 0 : 1 - Math.abs(max - 2 * min) / max;
}

const densBand = (d: number) => (d < 8 ? "S" : d < 10 ? "M" : d < 12 ? "L" : "H");
const streamBand = (d: number) => (d < 4.75 ? "B" : d < 6 ? "S" : d < 7 ? "M" : d < 7.5 ? "L" : "H");
const speedBand = (d: number) => (d < SPEED_S_LINE ? "S" : d < 8.5 ? "M" : d < 9.5 ? "L" : "—");
const rawJackLetter = (a: number) => (a >= 1.1 ? "F" : a >= 1.09 ? "R" : "P");
const streamLetter = (a: number) => (a >= 1.11 ? "F" : a >= 1.1 ? "R" : "P");
/** Jack manip: delta line; hand rule (3+ rows >= 20% of all rows) = Gluts -> R plus the W flag */
const jackManip = (a: number, delta: number | null, tri: number): [string, string] => {
  if (tri >= 0.2) return ["R", "W"];
  if (a > 1.11 || delta == null) return [rawJackLetter(a), ""];
  return [delta < 0.005 ? "F" : delta > 0.01 ? "P" : "R", ""];
};
/** Speed manip: per-section bullet-count band plus the T/W flags */
const speedManip = (a: number, bullet: number): [string, string] => {
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

  // Note times and column prefix counts (absolute time)
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

  // Chain anchor A (guide 4.1.2.1) plus the spike-min anchor (delta baseline)
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

  // Sections: density, jack/stream section typing, bullet pairs
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

  // Chart family: lock1 >= 10% = main jack
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

  // Pool routing: main-jack charts use every section as the jack pool, main-stream charts every section as the stream pool (matches the test tables)
  const jackPool = isJackChart ? means : jackMeans;
  const streamPool = isJackChart ? streamMeans : means;

  // Share of 3+ note rows (denominator: all rows)
  let nRowsAll = 0, nRows3 = 0;
  for (const r of rows) {
    if (r.n >= 1) nRowsAll++;
    if (r.n >= 3) nRows3++;
  }
  const tri = nRowsAll ? nRows3 / nRowsAll : 0;

  const jD = densBand(q(jackPool, means, 0.9));
  const [jL, jFlag] = jackManip(chainA, delta, tri);
  const sD = streamBand(q(streamPool, means, 0.9));
  const sL = streamLetter(chainA);
  const pRaw = p50Stream * 2; // the speed pool is always the stream sections (cross-family axis)
  const pOut = pRaw >= 9.5;
  const pD = pOut ? "O" : speedBand(pRaw);
  const [pL, pFlag] = speedManip(chainA, bP50);

  return {
    jack: `${jD}${jL}-Jack${jFlag ? "-" + jFlag : ""}`,
    stream: `${sD}${sL}-Stream`,
    speed: pOut ? `O-Speed${pFlag ? "-" + pFlag : ""}` : `${pD}${pL}-Speed${pFlag ? "-" + pFlag : ""}`,
  };
}
