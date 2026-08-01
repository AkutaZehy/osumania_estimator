// ============================================================
// fit.ts — Fit estimator params from calib/labels.json (user
// labels) joined with calib/scan.json features.
//
//   RC channel:  RC = a + b*sunny + c*jackShare + d*lnRatio
//     (RC label = difficulty of the map as a pure-key chart;
//      lnRatio down-weights LN maps whose keys are sparse)
//   LN channel:  LN = a + b*sunny  per pool (TEC / COO / other)
//     (LN label = actual difficulty incl. LN control; pools fit
//      separate slopes — TEC showed a steeper slope)
//
// Labels are used regardless of isLN: RC value trains RC,
// LN value trains LN.
//
// Run: npm run calib:fit
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";

const SCAN = "calib/scan.json";
const LABELS = "calib/labels.json";

function lsolve(X: number[][], y: number[]): number[] {
  const n = X.length;
  if (n === 0) return [];
  const p = X[0]!.length;
  const Xt: number[][] = Array.from({ length: p }, (_, j) => X.map((row) => row[j]!));
  const XtX: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => Xt[i]!.reduce((s, v, k) => s + v * Xt[j]![k]!, 0)));
  const Xty: number[] = Xt.map((row) => row.reduce((s, v, k) => s + v * y[k]!, 0));
  return gaussElim(XtX, Xty);
}
function gaussElim(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12) throw new Error("singular");
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let c = col; c <= n; c++) M[r]![c] = M[r]![c]! - f * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

const scan = JSON.parse(readFileSync(SCAN, "utf8")) as { maps: any[] };
const labels = JSON.parse(readFileSync(LABELS, "utf8")) as { labels: Record<string, { isvibro: boolean; RC: number | null; LN: number | null }> };
const byMd5 = new Map(scan.maps.map((m) => [m.md5, m]));

interface RcSample { md5: string; label: number; sunny: number; jackShare: number; lnRatio: number }
interface LnSample { md5: string; label: number; sunny: number; mainPool: string }

const rcSamples: RcSample[] = [];
const lnSamples: LnSample[] = [];
for (const [md5, l] of Object.entries(labels.labels)) {
  const m = byMd5.get(md5);
  if (!m) { console.log("  [skip] md5 not in scan:", md5.slice(0, 8)); continue; }
  if (l.isvibro) continue;
  const share = (cat: string) => (m.structures?.[cat] ?? []).reduce((s: number, e: any) => s + e.pct, 0) / 100;
  if (l.RC != null) rcSamples.push({ md5, label: l.RC, sunny: m.sunny, jackShare: share("jack"), lnRatio: m.lnRatio ?? 0 });
  if (l.LN != null) lnSamples.push({ md5, label: l.LN, sunny: m.sunny, mainPool: m.mainPool ?? "none" });
}

function fitRc(samples: RcSample[]): { params: number[]; mae: number; preds: [string, number, number][] } {
  const X = samples.map((s) => [1, s.sunny, s.jackShare, s.lnRatio]);
  const y = samples.map((s) => s.label);
  const params = lsolve(X, y);
  const preds = samples.map((s, i) => [s.md5, s.label, params[0]! + params[1]! * s.sunny + params[2]! * s.jackShare + params[3]! * s.lnRatio] as [string, number, number]);
  const mae = preds.reduce((s, p) => s + Math.abs(p[1]! - p[2]!), 0) / preds.length;
  console.log(`[RC] n=${samples.length}  RC = ${params[0]!.toFixed(4)} + ${params[1]!.toFixed(4)}*sunny + ${params[2]!.toFixed(4)}*jackShare + ${params[3]!.toFixed(4)}*lnRatio  训练MAE=${mae.toFixed(3)}`);
  return { params, mae, preds };
}

function fitLn(samples: LnSample[], pools: string[]): { params: Record<string, number[]>; mae: number; preds: [string, number, number][] } {
  const params: Record<string, number[]> = {};
  const preds: [string, number, number][] = [];
  let err = 0;
  for (const pool of pools) {
    const sub = samples.filter((s) => s.mainPool === pool);
    if (sub.length < 2) { console.log(`[LN:${pool}] 样本不足 (${sub.length})，归入 other`); continue; }
    const X = sub.map((s) => [1, s.sunny]);
    const y = sub.map((s) => s.label);
    const p = lsolve(X, y);
    params[pool] = p;
    for (const s of sub) {
      const pred = p[0]! + p[1]! * s.sunny;
      preds.push([s.md5, s.label, pred]);
      err += Math.abs(s.label - pred);
    }
    console.log(`[LN:${pool}] n=${sub.length}  LN = ${p[0]!.toFixed(4)} + ${p[1]!.toFixed(4)}*sunny`);
  }
  const mae = preds.length ? err / preds.length : NaN;
  console.log(`[LN] 已拟合池子样本合计 n=${preds.length} 训练MAE=${mae.toFixed(3)}`);
  return { params, mae, preds };
}

const rcFit = fitRc(rcSamples);
const pools = [...new Set(lnSamples.map((s) => s.mainPool))];
const lnFit = fitLn(lnSamples, pools);

const show = (preds: [string, number, number][], n: number, label: string) => {
  console.log(`--- ${label} 残差最大 ${n} 张 ---`);
  [...preds].sort((a, b) => Math.abs(b[1]! - b[2]!) - Math.abs(a[1]! - a[2]!)).slice(0, n)
    .forEach(([md5, lab, pred]) => {
      const m = byMd5.get(md5);
      console.log(`  label ${lab} pred ${pred.toFixed(2)} | ${m?.title} ${m?.version}`);
    });
};
show(rcFit.preds, 8, "RC");
show(lnFit.preds, 6, "LN");

writeFileSync("calib/fit_result.json", JSON.stringify({
  rc: rcFit.params, rcMae: rcFit.mae, rcN: rcSamples.length,
  ln: lnFit.params, lnMae: lnFit.mae, lnN: lnSamples.length, pools,
}, null, 2));
