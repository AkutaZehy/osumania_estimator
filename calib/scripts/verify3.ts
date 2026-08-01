// verify3.ts — end-to-end v3 check: real analyzeBeatmap → estimateDifficulty
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";
import { estimateDifficulty } from "../../src/estimate.js";

const bench = new Map<string, { pattern: string; expected: number }>();
for (const line of readFileSync("calib/bench-maps/file.csv", "utf8").split("\n")) {
  const m = line.match(/^(?:[0-9]*,)?(.*?),(tech|stamina|speed|jack|ln),([^,]*),([^,]*),/);
  if (!m) continue;
  const expected = parseFloat(m[4]!);
  if (!Number.isFinite(expected)) continue;
  bench.set(m[1]!.replace(/^,/, "").trim(), { pattern: m[2]!, expected });
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (e.toLowerCase().endsWith(".osu")) out.push(full);
  }
  return out;
}

const rcErr: Array<[string, number, number]> = [];
const lnErr: Array<[string, number, number]> = [];
for (const file of walk("calib/bench-maps")) {
  const row = bench.get(basename(file, ".osu").trim());
  if (!row) continue;
  const result = analyzeBeatmap(readFileSync(file, "utf8"));
  const est = estimateDifficulty(result);
  const isLN = row.pattern === "ln";
  const pred = isLN ? est.ln : est.rc;
  if (pred == null) continue;
  const err = row.expected - pred;
  (isLN ? lnErr : rcErr).push([row.pattern, row.expected, pred]);
}
const mae = (arr: Array<[string, number, number]>) => arr.reduce((s, [_, e, p]) => s + Math.abs(e - p), 0) / arr.length;
const band = (arr: Array<[string, number, number]>, lo: number, hi: number) => arr.filter(([_, e]) => e >= lo && e <= hi);
for (const [name, arr] of [["RC", rcErr], ["LN", lnErr]] as const) {
  console.log(`${name}: 低段MAE=${mae(band(arr, 0, 6.75)).toFixed(3)}(n=${band(arr, 0, 6.75).length}) 中段MAE=${mae(band(arr, 5, 10.5)).toFixed(3)}(n=${band(arr, 5, 10.5).length}) 高段MAE=${mae(band(arr, 10.5, 18)).toFixed(3)}(n=${band(arr, 10.5, 18).length}) 全段=${mae(arr).toFixed(3)}(n=${arr.length})`);
}
// stage3 专项
const s3 = lnErr.filter(([p, e]) => p === "ln");
const stage3Err = [];
for (const file of walk("calib/bench-maps/ln")) {
  if (!file.includes("Stage 3")) continue;
  const row = bench.get(basename(file, ".osu").trim());
  if (!row) continue;
  const result = analyzeBeatmap(readFileSync(file, "utf8"));
  const est = estimateDifficulty(result);
  if (est.ln == null) continue;
  stage3Err.push([basename(file, ".osu").slice(0, 40), row.expected, est.ln]);
}
console.log(`\n=== Stage 3 LN 专项 (n=${stage3Err.length}) ===`);
for (const [name, e, p] of stage3Err) console.log(`  ${String(name).padEnd(42)} exp=${String(e).padEnd(4)} est=${p.toFixed(2)} err=${(e - p).toFixed(2)}`);
