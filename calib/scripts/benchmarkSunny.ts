// ============================================================
// benchmarkSunny.ts — Run OUR sunny pipeline over leoblack's
// benchmark charts (References/.../files.7z) and pair each
// chart with its EXPECTED RC (from file.csv). Output:
//   calib/benchmark_sunny.json
//
// Run: npm run calib:bench
// ============================================================

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";

const BENCH_DIR = process.argv[2] ?? "calib/bench-maps";

interface BenchRow { name: string; pattern: string; subPattern: string; expected: number }
const bench = new Map<string, BenchRow>();
{
  const lines = readFileSync(join(BENCH_DIR, "file.csv"), "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^(?:[0-9]*,)?(.*?),(tech|stamina|speed|jack|ln),([^,]*),([^,]*),/);
    if (!m) continue;
    const expected = parseFloat(m[4]!);
    if (!Number.isFinite(expected)) continue;
    if (expected > 6.75) continue; // 只关心低难区间（6 mid 以下）
    const name = m[1]!.replace(/^,/, "").trim();
    if (!name) continue;
    bench.set(name, { name, pattern: m[2]!, subPattern: m[3]!, expected });
  }
}

function walk(dir: string): string[] {
  const acc: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) acc.push(...walk(full));
    else if (entry.toLowerCase().endsWith(".osu")) acc.push(full);
  }
  return acc;
}

const out: any[] = [];
let matched = 0, unmatched = 0, failed = 0;
const files = walk(BENCH_DIR);
for (const file of files) {
  const base = basename(file, ".osu").trim();
  const row = bench.get(base);
  if (!row) continue; // 只处理低难区间内的图
  matched++;
  let sunny: number | null = null;
  let err: string | null = null;
  try {
    const text = readFileSync(file, "utf8");
    const result = analyzeBeatmap(text);
    sunny = result.sunny.star > 0 ? +result.sunny.star.toFixed(4) : 0;
  } catch (e) {
    failed++;
    err = e instanceof Error ? e.message : String(e);
  }
  out.push({ name: row?.name ?? base, pattern: row?.pattern ?? "", expected: row?.expected ?? null, sunny, err });
}

writeFileSync("calib/benchmark_sunny.json", JSON.stringify(out, null, 1));
const withBoth = out.filter((r) => r.expected != null && r.sunny != null);
console.log(`lowDan=${matched} files=${files.length} failed=${failed} withBoth=${withBoth.length}`);

