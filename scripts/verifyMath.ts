// Old (bisect-based) mathUtils vs new (monotonic-pointer) — bit-exact compare.
import { interpValues, stepInterp, smoothOnCorners, bisectLeft, bisectRight, cumulativeSum } from "../src/algorithm/mathUtils.js";

// ---- OLD implementations (verbatim pre-opt) ----
function oldInterp(knownXs: Float64Array, knownYs: Float64Array, queryXs: Float64Array): Float64Array {
  const result = new Float64Array(queryXs.length);
  for (let i = 0; i < queryXs.length; i++) {
    const x = queryXs[i]!;
    const idx = bisectLeft(knownXs, x);
    if (idx === 0) result[i] = knownYs[0]!;
    else if (idx >= knownXs.length) result[i] = knownYs[knownYs.length - 1]!;
    else {
      const x0 = knownXs[idx - 1]!, x1 = knownXs[idx]!, y0 = knownYs[idx - 1]!, y1 = knownYs[idx]!;
      result[i] = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return result;
}
function oldStep(knownXs: Float64Array, knownYs: Float64Array, queryXs: Float64Array): Float64Array {
  const result = new Float64Array(queryXs.length);
  for (let i = 0; i < queryXs.length; i++) {
    const idx = bisectRight(knownXs, queryXs[i]!) - 1;
    result[i] = idx >= 0 ? knownYs[idx]! : knownYs[0]!;
  }
  return result;
}
function oldSmooth(x: Float64Array, f: Float64Array, window: number, scale = 1.0, mode: "sum" | "avg" = "sum"): Float64Array {
  const F = cumulativeSum(x, f);
  const g = new Float64Array(f.length);
  for (let i = 0; i < x.length; i++) {
    const s = x[i]!;
    const a = Math.max(s - window, x[0]!);
    const b = Math.min(s + window, x[x.length - 1]!);
    const qc = (q: number): number => {
      if (q <= x[0]!) return 0;
      if (q >= x[x.length - 1]!) return F[F.length - 1]!;
      const j = bisectRight(x, q) - 1;
      return F[j]! + f[j]! * (q - x[j]!);
    };
    const val = qc(b) - qc(a);
    if (mode === "avg") g[i] = b - a > 0 ? val / (b - a) : 0;
    else g[i] = scale * val;
  }
  return g;
}

let bad = 0, checks = 0;
const eq = (a: Float64Array, b: Float64Array, label: string): void => {
  checks++;
  if (a.length !== b.length) { bad++; console.log(`LEN ${label}: ${a.length} vs ${b.length}`); return; }
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) { bad++; console.log(`VAL ${label}[${i}]: ${a[i]} vs ${b[i]}`); return; }
  }
};
// deterministic PRNG
let seed = 42;
const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

for (let trial = 0; trial < 50; trial++) {
  const n = 1 + Math.floor(rnd() * 2000);
  const xs = new Float64Array(n);
  let t = rnd() * 1e5;
  for (let i = 0; i < n; i++) { xs[i] = t; t += rnd() * 50; }
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) ys[i] = rnd() * 1e3;

  // query arrays: ascending (real usage), plus edge-heavy variants
  const qn = 1 + Math.floor(rnd() * 3000);
  const qAsc = new Float64Array(qn);
  let q = xs[0]! - rnd() * 100;
  for (let i = 0; i < qn; i++) { qAsc[i] = q; q += rnd() * 60; }
  const qEdge = new Float64Array(qn);
  for (let i = 0; i < qn; i++) qEdge[i] = xs[Math.floor(rnd() * n)]! + (rnd() - 0.5) * 0.001; // duplicate-heavy

  eq(oldInterp(xs, ys, qAsc), interpValues(xs, ys, qAsc), `interp asc #${trial}`);
  eq(oldInterp(xs, ys, qEdge), interpValues(xs, ys, qEdge), `interp edge #${trial}`);
  eq(oldStep(xs, ys, qAsc), stepInterp(xs, ys, qAsc), `step asc #${trial}`);
  eq(oldStep(xs, ys, qEdge), stepInterp(xs, ys, qEdge), `step edge #${trial}`);

  const win = rnd() * 2000;
  for (const mode of ["sum", "avg"] as const) {
    eq(oldSmooth(xs, ys, win, 1.0, mode), smoothOnCorners(xs, ys, win, 1.0, mode), `smooth ${mode} #${trial}`);
  }
  // degenerate: single element
  if (trial % 10 === 0) {
    const one = new Float64Array([500]);
    const oneY = new Float64Array([3.5]);
    eq(oldInterp(one, oneY, new Float64Array([0, 500, 1000])), interpValues(one, oneY, new Float64Array([0, 500, 1000])), `interp single #${trial}`);
    eq(oldStep(one, oneY, new Float64Array([0, 500, 1000])), stepInterp(one, oneY, new Float64Array([0, 500, 1000])), `step single #${trial}`);
    eq(oldSmooth(one, oneY, 250, 1.0, "sum"), smoothOnCorners(one, oneY, 250, 1.0, "sum"), `smooth single #${trial}`);
  }
}
console.log(`${checks} comparisons, ${bad} mismatches`);