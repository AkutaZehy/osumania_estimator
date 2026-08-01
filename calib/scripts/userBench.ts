// ============================================================
// userBench.ts — Run OUR pipeline over the user's local maps/
// that matched leoblack's benchmark (by BeatmapID) and pair
// them with EXPECTED RC from file.csv. Append to
//   calib/benchmark_sunny.json
//
// Run: npm run calib:bench:user
// ============================================================

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";

const CSV = "calib/bench-maps/file.csv";
const USER_MAPS = "maps";
const OUT = "calib/benchmark_sunny.json";

interface BenchRow { name: string; pattern: string; expected: number }
function loadCsv(): BenchRow[] {
  const rows: BenchRow[] = [];
  for (const line of readFileSync(CSV, "utf8").split("\n")) {
    const m = line.match(/^(?:[0-9]*,)?(.*?),(tech|stamina|speed|jack|ln),([^,]*),([^,]*),/);
    if (!m) continue;
    const expected = parseFloat(m[4]!);
    if (!Number.isFinite(expected) || expected > 6.75) continue;
    const name = m[1]!.replace(/^,/, "").trim();
    if (!name) continue;
    rows.push({ name, pattern: m[2]!, expected });
  }
  return rows;
}
const csvByName = new Map(loadCsv().map((r) => [r.name, r]));

// bench 文件名 → 同一名字在 csv 里
const benchFiles = walk("calib/bench-maps");
const benchBidToName = new Map<number, string>();
for (const f of benchFiles) {
  const meta = metaOf(readFileSync(f, "utf8"));
  if (meta.bid) benchBidToName.set(meta.bid, basename(f, ".osu").trim());
}

let added = 0, dup = 0;
const existing = readExisting();
const have = new Set(existing.map((r: any) => r.name));
for (const f of walk(USER_MAPS)) {
  const text = readFileSync(f, "utf8");
  const meta = metaOf(text);
  const base = basename(f, ".osu").trim();
  const row = csvByName.get(base) ?? (meta.bid ? csvByName.get(benchBidToName.get(meta.bid) ?? "") : undefined);
  if (!row) continue;
  if (have.has(row.name)) { dup++; continue; }
  let sunny: number | null = null;
  let err: string | null = null;
  try {
    const result = analyzeBeatmap(text);
    sunny = result.sunny.star > 0 ? +result.sunny.star.toFixed(4) : 0;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  existing.push({ name: row.name, pattern: row.pattern, expected: row.expected, sunny, err, source: "user-maps" });
  have.add(row.name);
  added++;
}
writeFileSync(OUT, JSON.stringify(existing, null, 1));
console.log(`[userBench] added=${added} dup=${dup} total=${existing.length}`);

function walk(dir: string): string[] {
  const acc: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) acc.push(...walk(full));
    else if (e.toLowerCase().endsWith(".osu")) acc.push(full);
  }
  return acc;
}
function metaOf(text: string): { bid: number; title: string } {
  const m = text.match(/\[Metadata\]([\s\S]*?)(?=\[[A-Za-z]+\])/);
  const s = m?.[1] ?? "";
  const get = (k: string) => s.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
  return { bid: +get("BeatmapID") || 0, title: get("Title") };
}
function readExisting(): any[] {
  try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return []; }
}
