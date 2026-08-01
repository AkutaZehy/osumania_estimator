import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";
import { estimateDifficulty } from "../../src/estimate.js";

const BENCH_DIR = "calib/bench-maps";
const LO = 5.0, HI = 10.5;

interface BenchRow { name: string; pattern: string; expected: number }
const bench = new Map<string, BenchRow>();
for (const line of readFileSync(join(BENCH_DIR, "file.csv"), "utf8").split("\n")) {
  const m = line.match(/^(?:[0-9]*,)?(.*?),(tech|stamina|speed|jack|ln),([^,]*),([^,]*),/);
  if (!m) continue;
  const expected = parseFloat(m[4]!);
  if (!Number.isFinite(expected) || expected < LO || expected > HI) continue;
  const name = m[1]!.replace(/^,/, "").trim();
  if (!name) continue;
  bench.set(name, { name, pattern: m[2]!, expected });
}
function walk(dir: string): string[] {
  const acc: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) acc.push(...walk(full));
    else if (e.toLowerCase().endsWith(".osu")) acc.push(full);
  }
  return acc;
}

const out: any[] = [];
for (const file of walk(BENCH_DIR)) {
  const row = bench.get(basename(file, ".osu").trim());
  if (!row) continue;
  let est: any = null;
  let err: string | null = null;
  try {
    const result = analyzeBeatmap(readFileSync(file, "utf8"));
    est = estimateDifficulty(result);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  const isLn = row.pattern === "ln";
  const estVal = est ? (isLn ? est.ln : est.rc) : null;
  out.push({ name: row.name, pattern: row.pattern, expected: row.expected, mode: est?.mode, est: estVal == null ? null : +estVal.toFixed(2), err: estVal == null ? null : +(estVal - row.expected).toFixed(2), rawErr: estVal == null ? null : estVal - row.expected });
}
writeFileSync("calib/benchmark_mid_check.json", JSON.stringify(out, null, 1));
const valid = out.filter((r) => r.est != null);
const mae = valid.reduce((s, r) => s + Math.abs(r.rawErr), 0) / valid.length;
const byPat: Record<string, number[]> = {};
for (const r of valid) (byPat[r.pattern] ??= []).push(Math.abs(r.rawErr));
console.log(`n=${valid.length} (range ${LO}-${HI})  MAE=${mae.toFixed(3)}`);
for (const [p, es] of Object.entries(byPat)) console.log(`  ${p.padEnd(7)} n=${String(es.length).padEnd(3)} MAE=${(es.reduce((a, b) => a + b, 0) / es.length).toFixed(3)}`);
const worst = [...valid].sort((a, b) => Math.abs(b.rawErr) - Math.abs(a.rawErr)).slice(0, 15);
console.log("--- 最大误差 Top15 ---");
for (const r of worst) console.log(`  ${r.pattern.padEnd(7)} exp ${String(r.expected).padEnd(5)} est ${String(r.est).padEnd(5)} err ${String(r.err).padEnd(6)} ${r.name}`);

