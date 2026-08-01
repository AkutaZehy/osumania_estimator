// ============================================================
// fit4.ts — refit v3 model on the exact feature subset that
// estimate.ts can extract at runtime, emits calib/fit4_result.json
// RC: sunny, lnRatio, jackShare, grade shares, stamina, techTrills24, duration
// LN: sunny, bpm, durationSec, pool scores (continuous), ln pattern counts
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface FRow {
  sunny: number; bpm: number; lnRatio: number; durationSec: number;
  jackShare: number; staminaMedTotal: number; staminaStretchRatio: number;
  staminaSwitchFreq: number; techTrills24: number;
  jackGrade: Record<string, number>; streamGrade: Record<string, number>;
  jackMaxW?: number; jackMaxPeak?: number; jackMedW?: number;
  streamMaxW?: number; streamMaxPeak?: number; streamMedW?: number;
  strictLNRatio: number; releaseDifficulty: number;
  lnShield: number; lnColumnLock: number; lnOverlay: number;
  pools: Record<string, number>; mainPool: string;
  pattern: string; expected: number | null; md5: string;
}

const data = JSON.parse(readFileSync(resolve("calib/features.json"), "utf8")) as FRow[];

// optionally swap low-band truth for user labels (fit5 variant)
function loadExpected(): (r: FRow) => number | null {
  const labels = JSON.parse(readFileSync(resolve("calib/labels.json"), "utf8")) as { labels: Record<string, { RC: number | null; LN: number | null }> };
  return (r: FRow) => {
    if (r.expected == null) return null;
    const lab = labels.labels[r.md5];
    if (!lab) return r.expected;
    if (r.pattern === "ln" && lab.LN != null) return lab.LN;
    if (r.pattern !== "ln" && lab.RC != null) return lab.RC;
    return r.expected;
  };
}

function ols(X: number[][], y: number[]): { coef: number[]; se: number[]; pred: (r: number[]) => number } {
  const n = X.length, p = X[0]!.length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  const ridge = 1e-6;
  for (let i = 0; i < n; i++) {
    const xi = X[i]!;
    for (let a = 0; a < p; a++) { Xty[a]! += xi[a]! * y[i]!; for (let b = 0; b < p; b++) XtX[a]![b]! += xi[a]! * xi[b]!; }
  }
  for (let a = 0; a < p; a++) XtX[a]![a]! += ridge;
  const M = XtX.map((row, r) => [...row, Xty[r]!]);
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const d = M[col]![col]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let c = col; c <= p; c++) M[col]![c]! /= d;
    for (let r = 0; r < p; r++) { if (r === col) continue; const f = M[r]![col]!; if (f === 0) continue; for (let c = col; c <= p; c++) M[r]![c]! -= f * M[col]![c]!; }
  }
  const coef = M.map((r) => r[p]!);
  const resid = y.map((yi, i) => yi - X[i]!.reduce((s, xj, j) => s + xj * coef[j]!, 0));
  const s2 = resid.reduce((s, e) => s + e * e, 0) / Math.max(1, n - p);
  const se = new Array(p).fill(0);
  for (let a = 0; a < p; a++) {
    const Mi = XtX.map((r, rr) => [...r, rr === a ? 1 : 0]);
    for (let col = 0; col < p; col++) {
      let piv = col;
      for (let r = col + 1; r < p; r++) if (Math.abs(Mi[r]![col]!) > Math.abs(Mi[piv]![col]!)) piv = r;
      [Mi[col], Mi[piv]] = [Mi[piv]!, Mi[col]!];
      const d = Mi[col]![col]!;
      if (Math.abs(d) < 1e-12) continue;
      for (let c = 0; c <= p; c++) Mi[col]![c]! /= d;
      for (let r = 0; r < p; r++) { if (r === col) continue; const f = Mi[r]![col]!; if (f === 0) continue; for (let c = 0; c <= p; c++) Mi[r]![c]! -= f * Mi[col]![c]!; }
    }
    se[a] = Math.sqrt(s2 * Math.abs(Mi[a]![p]!));
  }
  const pred = (r: number[]): number => r.reduce((s, xj, j) => s + xj * coef[j]!, 0);
  return { coef, se, pred };
}

function report(title: string, rows: FRow[], mode: "rc" | "ln", yFn: (r: FRow) => number | null): void {
  const train = rows.filter((r) => yFn(r) != null);
  let feats: Array<[string, (r: FRow) => number]> = [];
  if (mode === "rc") {
    feats = [
      ["sunny", (r) => r.sunny], ["lnRatio", (r) => r.lnRatio], ["jackShare", (r) => r.jackShare],
      ["durationSec", (r) => r.durationSec],
      ["staminaMedTotal", (r) => r.staminaMedTotal], ["staminaStretchRatio", (r) => r.staminaStretchRatio],
      ["staminaSwitchFreq", (r) => r.staminaSwitchFreq], ["techTrills24", (r) => r.techTrills24],
      ["jackMaxW", (r) => r.jackMaxW ?? 0], ["jackMaxPeak", (r) => r.jackMaxPeak ?? 0], ["jackMedW", (r) => r.jackMedW ?? 0],
      ["streamMaxW", (r) => r.streamMaxW ?? 0], ["streamMaxPeak", (r) => r.streamMaxPeak ?? 0], ["streamMedW", (r) => r.streamMedW ?? 0],
    ];
  } else {
    feats = [
      ["sunny", (r) => r.sunny], ["bpm", (r) => r.bpm], ["durationSec", (r) => r.durationSec],
      ["pool_coordination", (r) => r.pools.coordination ?? 0], ["pool_density", (r) => r.pools.density ?? 0],
      ["pool_wildcard", (r) => r.pools.wildcard ?? 0], ["pool_technical", (r) => r.pools.technical ?? 0],
      ["strictLNRatio", (r) => r.strictLNRatio], ["releaseDifficulty", (r) => r.releaseDifficulty],
      ["lnShield", (r) => r.lnShield], ["lnColumnLock", (r) => r.lnColumnLock], ["lnOverlay", (r) => r.lnOverlay],
    ];
  }
  const X = train.map((r) => { const row = [1]; for (const [, g] of feats) row.push(g(r)); return row; });
  const y = train.map((r) => yFn(r)!);
  const { coef, se, pred } = ols(X, y);
  console.log(`\n=== ${title} (n=${train.length}, p=${coef.length}) ===`);
  const names = ["const", ...feats.map(([n]) => n)];
  for (let j = 0; j < coef.length; j++) {
    const t = coef[j]! / (se[j]! || 1);
    console.log(`  ${names[j]!.padEnd(24)} ${coef[j]!.toFixed(4).padStart(9)}  t=${t.toFixed(2)}`);
  }
  const err = (r: FRow): number => {
    const row = [1]; for (const [, g] of feats) row.push(g(r));
    return yFn(r)! - pred(row);
  };
  const mae = (arr: FRow[]): number => arr.length === 0 ? NaN : arr.reduce((s, r) => s + Math.abs(err(r)), 0) / arr.length;
  const lo = train.filter((r) => yFn(r)! <= 6.75);
  const mid = train.filter((r) => yFn(r)! >= 5 && yFn(r)! <= 10.5);
  const hi = train.filter((r) => yFn(r)! > 10.5);
  console.log(`  低段<=6.75: MAE=${mae(lo).toFixed(3)} (n=${lo.length})`);
  console.log(`  中段5-10.5: MAE=${mae(mid).toFixed(3)} (n=${mid.length})`);
  console.log(`  高段>10.5:  MAE=${mae(hi).toFixed(3)} (n=${hi.length})`);
  writeFileSync(resolve("calib/fit4_result.json"), JSON.stringify({ mode, coef, feats: names, n: train.length }, null, 1));
}

report("RC (benchmark truth)", data.filter((r) => r.pattern !== "ln"), "rc", (r) => r.expected);
report("LN (benchmark truth)", data.filter((r) => r.pattern === "ln"), "ln", (r) => r.expected);

const userY = loadExpected();
report("RC (user-swapped truth)", data.filter((r) => r.pattern !== "ln"), "rc", userY);
report("LN (user-swapped truth)", data.filter((r) => r.pattern === "ln"), "ln", userY);


