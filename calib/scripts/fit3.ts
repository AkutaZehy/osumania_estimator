// ============================================================
// fit3.ts — v3 multi-feature fit.
// Trains on benchmark truth (full 1-18 dan range), reports
// per-band MAE + per-feature t-stat, emits calib/fit3_result.json
//
// Run: npx esbuild calib/scripts/fit3.ts --bundle --platform=node
//      --format=esm --outfile=calib/.tmp/fit3.mjs --log-level=error
//      && node calib/.tmp/fit3.mjs
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface FRow {
  sunny: number; sunnyRice: number | null; bpm: number; lnRatio: number;
  jackShare: number; jackGrade: number; jackSfp: number; jackShp: number;
  jackImbalance: number; jackIsBias: number; jackBpm: number;
  streamShare: number; streamIsHandstream: number; streamBrokenMax: number; streamBpm: number;
  techSfkps: number; techTrills16: number; techTrills24: number;
  staminaMedTotal: number; staminaStretchRatio: number; staminaSwitchFreq: number;
  anchorSfP50: number; anchorShP50: number;
  strictLNRatio: number; releaseDifficulty: number; lnShield: number;
  lnInverse: number; lnColumnLock: number; lnOverlay: number;
  lnChord: number; lnStream: number; lnWcJack: number; lnWcSpeed: number;
  mainPool: string; pools: Record<string, number>;
  pattern: string; expected: number | null; md5: string; name: string;
}

const data = JSON.parse(readFileSync(resolve("calib/features.json"), "utf8")) as FRow[];

function ols(X: number[][], y: number[]): { coef: number[]; se: number[]; pred: (r: number[]) => number } {
  const n = X.length, p = X[0]!.length;
  // XᵀX + tiny ridge for stability
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty: number[] = new Array(p).fill(0);
  const ridge = 1e-6;
  for (let i = 0; i < n; i++) {
    const xi = X[i]!;
    for (let a = 0; a < p; a++) { Xty[a]! += xi[a]! * y[i]!; for (let b = 0; b < p; b++) XtX[a]![b]! += xi[a]! * xi[b]!; }
  }
  for (let a = 0; a < p; a++) XtX[a]![a]! += ridge;
  // Gaussian elimination solve
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
  // residual variance
  const resid = y.map((yi, i) => yi - X[i]!.reduce((s, xj, j) => s + xj * coef[j]!, 0));
  const s2 = resid.reduce((s, e) => s + e * e, 0) / Math.max(1, n - p);
  const se = new Array(p).fill(0);
  for (let a = 0; a < p; a++) {
    let inv = 1;
    // diagonal of inverse via Gauss-Jordan on identity column (approximate: reuse M is eliminated, recompute per column)
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
    inv = Mi[a]![p]!;
    se[a] = Math.sqrt(s2 * inv);
  }
  const pred = (r: number[]): number => r.reduce((s, xj, j) => s + xj * coef[j]!, 0);
  return { coef, se, pred };
}

const FIELDS: Array<[string, keyof FRow]> = [
  ["sunny", "sunny"], ["lnRatio", "lnRatio"],
  ["jackShare", "jackShare"], ["jackGrade", "jackGrade"], ["jackSfp", "jackSfp"],
  ["jackShp", "jackShp"], ["jackImbalance", "jackImbalance"], ["jackIsBias", "jackIsBias"], ["jackBpm", "jackBpm"],
  ["streamIsHandstream", "streamIsHandstream"], ["streamBrokenMax", "streamBrokenMax"], ["streamBpm", "streamBpm"],
  ["techSfkps", "techSfkps"], ["techTrills16", "techTrills16"], ["techTrills24", "techTrills24"],
  ["staminaMedTotal", "staminaMedTotal"], ["staminaStretchRatio", "staminaStretchRatio"], ["staminaSwitchFreq", "staminaSwitchFreq"],
  ["anchorSfP50", "anchorSfP50"], ["anchorShP50", "anchorShP50"],
];

function report(title: string, rows: FRow[], yFn: (r: FRow) => number | null, fields: Array<[string, keyof FRow]>, oneHotPool = false, useRice = false): void {
  const train = rows.filter((r) => yFn(r) != null);
  if (train.length < fields.length + 5) { console.log(`${title}: 样本不足 (${train.length})`); return; }
  const X = train.map((r) => {
    const row = [1];
    for (const [, f] of fields) row.push(Number(r[f]) || 0);
    if (oneHotPool) for (const p of ["coordination", "density", "wildcard", "technical"]) row.push(r.mainPool === p ? 1 : 0);
    if (useRice) row.push(r.sunnyRice ?? r.sunny);
    return row;
  });
  const y = train.map((r) => yFn(r)!);
  const { coef, se, pred } = ols(X, y);
  console.log(`\n=== ${title} (n=${train.length}, p=${coef.length}) ===`);
  const names = ["const", ...fields.map(([n]) => n)];
  if (oneHotPool) names.push(...["pool_coordination", "pool_density", "pool_wildcard", "pool_technical"]);
  if (useRice) names.push("sunnyRice");
  for (let j = 0; j < coef.length; j++) {
    const t = coef[j]! / (se[j]! || 1);
    console.log(`  ${names[j]!.padEnd(22)} ${coef[j]!.toFixed(4).padStart(9)}  t=${t.toFixed(2)}`);
  }
  const mae = (arr: FRow[]): number => arr.length === 0 ? NaN : arr.reduce((s, r) => s + Math.abs(yFn(r)! - pred(X[train.indexOf(r)]!)), 0) / arr.length;
  const lo = train.filter((r) => yFn(r)! <= 6.75);
  const mid = train.filter((r) => yFn(r)! >= 5 && yFn(r)! <= 10.5);
  const hi = train.filter((r) => yFn(r)! > 10.5);
  console.log(`  低段<=6.75: MAE=${mae(lo).toFixed(3)} (n=${lo.length})`);
  console.log(`  中段5-10.5: MAE=${mae(mid).toFixed(3)} (n=${mid.length})`);
  console.log(`  高段>10.5:  MAE=${mae(hi).toFixed(3)} (n=${hi.length})`);
}

const bench = data.filter((r) => r.expected != null);
const user = data.filter((r) => r.expected == null);

report("RC (benchmark, all bands)", bench.filter((r) => r.pattern !== "ln"), (r) => r.expected, FIELDS);
report("LN (benchmark, all bands)", bench.filter((r) => r.pattern === "ln"), (r) => r.expected,
  [["sunny", "sunny"], ["bpm", "bpm"], ["strictLNRatio", "strictLNRatio"], ["releaseDifficulty", "releaseDifficulty"],
   ["lnShield", "lnShield"], ["lnInverse", "lnInverse"], ["lnColumnLock", "lnColumnLock"], ["lnOverlay", "lnOverlay"],
   ["lnChord", "lnChord"], ["lnStream", "lnStream"], ["lnWcJack", "lnWcJack"], ["lnWcSpeed", "lnWcSpeed"],
   ["staminaMedTotal", "staminaMedTotal"]], true, true);

// user-label residuals against the RC model
console.log("\n=== 用户标注 vs benchmark 模型（RC）===");
const rcRows = bench.filter((r) => r.pattern !== "ln");
{
  const X = rcRows.map((r) => { const row = [1]; for (const [, f] of FIELDS) row.push(Number(r[f]) || 0); return row; });
  const y = rcRows.map((r) => r.expected!);
  const { pred } = ols(X, y);
  const labels = JSON.parse(readFileSync(resolve("calib/labels.json"), "utf8"));
  let sum = 0, n = 0;
  for (const r of user) {
    const lab = labels.labels[r.md5];
    if (lab?.RC == null) continue;
    const row = [1]; for (const [, f] of FIELDS) row.push(Number(r[f]) || 0);
    const p = pred(row);
    sum += lab.RC - p;
    n++;
  }
  console.log(`  用户RC标注 - 模型预测: mean=${(sum / n).toFixed(3)} (n=${n})`);
}

writeFileSync(resolve("calib/fit3_result.json"), JSON.stringify({ generatedAt: new Date().toISOString() }, null, 1));
console.log("\n[fit3] wrote calib/fit3_result.json");
