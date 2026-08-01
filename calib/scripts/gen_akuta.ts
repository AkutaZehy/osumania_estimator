// gen_akuta.ts — 生成 Akuta.csv（当前 estimate 的 RC/LN 估计）+ 更新 docs/data/index.json
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";
import { estimateDifficulty } from "../../src/estimate.js";

const bench = new Map<string, { pattern: string; sub: string; expected: number }>();
for (const line of readFileSync("calib/bench-maps/file.csv", "utf8").split("\n")) {
  const m = line.match(/^(?:[0-9]*,)?(.*?),(tech|stamina|speed|jack|ln),([^,]*),([^,]*),/);
  if (!m) continue;
  const expected = parseFloat(m[4]!);
  if (!Number.isFinite(expected)) continue;
  bench.set(m[1]!.replace(/^,/, "").trim(), { pattern: m[2]!, sub: m[3]!.trim(), expected });
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

const rows: Array<{ name: string; pattern: string; sub: string; expected: number; got: number }> = [];
let missing = 0;
for (const file of walk("calib/bench-maps")) {
  const row = bench.get(basename(file, ".osu").trim());
  if (!row) { missing++; continue; }
  const result = analyzeBeatmap(readFileSync(file, "utf8"));
  const est = estimateDifficulty(result);
  const pred = row.pattern === "ln" ? est.ln : est.rc;
  if (pred == null) { missing++; continue; }
  rows.push({ name: basename(file, ".osu").trim(), pattern: row.pattern, sub: row.sub, expected: row.expected, got: pred });
}
console.log(`rows=${rows.length} missing=${missing}`);

rows.sort((a, b) => b.expected - a.expected);
const lines = ["bid,name,pattern,subPattern,expected,got,delta,deltaAbs"];
for (const r of rows) {
  const got = r.got.toFixed(2);
  const delta = (r.expected - r.got).toFixed(2);
  const deltaAbs = Math.abs(r.expected - r.got).toFixed(2);
  lines.push(`,${r.name},${r.pattern},${r.sub},${r.expected},${got},${delta},${deltaAbs}`);
}
const csv = lines.join("\n") + "\n";
const csvPath = "References/osumania_map_analyser/docs/data/Akuta.csv";
writeFileSync(csvPath, csv, "utf8");
console.log(`written: ${csvPath} (${Buffer.byteLength(csv, "utf8")} bytes, ${rows.length + 1} lines)`);

// ---- 更新 index.json ----
const indexPath = "References/osumania_map_analyser/docs/data/index.json";
const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
  generatedAt: string;
  algorithms: string[];
  files: Array<{ fileName: string; algorithm: string; sizeBytes: number; modifiedAt: string }>;
};
index.generatedAt = new Date().toISOString();
index.algorithms = [...index.algorithms.filter(a => a !== "Akuta"), "Akuta"].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
index.files = index.files.filter(f => f.algorithm !== "Akuta");
index.files.push({ fileName: "Akuta.csv", algorithm: "Akuta", sizeBytes: Buffer.byteLength(csv, "utf8"), modifiedAt: new Date().toISOString() });
index.files.sort((a, b) => a.algorithm.localeCompare(b.algorithm, undefined, { sensitivity: "base" }));
writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
console.log(`index.json updated: algorithms=${index.algorithms.join(",")}`);

// ---- 汇总统计 ----
const mae = (arr: typeof rows) => arr.reduce((s, r) => s + Math.abs(r.expected - r.got), 0) / arr.length;
const rc = rows.filter(r => r.pattern !== "ln");
const ln = rows.filter(r => r.pattern === "ln");
const band = (arr: typeof rows, lo: number, hi: number) => arr.filter(r => r.expected >= lo && r.expected <= hi);
console.log(`\nRC: 低段=${mae(band(rc, 0, 6.75)).toFixed(3)}(n=${band(rc, 0, 6.75).length}) 中段=${mae(band(rc, 5, 10.5)).toFixed(3)}(n=${band(rc, 5, 10.5).length}) 高段=${mae(band(rc, 10.5, 18)).toFixed(3)}(n=${band(rc, 10.5, 18).length}) 全段=${mae(rc).toFixed(3)}(n=${rc.length})`);
console.log(`LN: 低段=${mae(band(ln, 0, 6.75)).toFixed(3)}(n=${band(ln, 0, 6.75).length}) 中段=${mae(band(ln, 5, 10.5)).toFixed(3)}(n=${band(ln, 5, 10.5).length}) 高段=${mae(band(ln, 10.5, 18)).toFixed(3)}(n=${band(ln, 10.5, 18).length}) 全段=${mae(ln).toFixed(3)}(n=${ln.length})`);
