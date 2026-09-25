// ============================================================
// benchmarkEntropyProbe.ts — colEntropy / switch / dtCV over the
// Leo_Black benchmark corpus (external, READ-ONLY):
//   D:/Users/Documents/GitHub/osumania_map_analyser/docs/data/files
// grouped by pattern + subPattern from file.csv.
// All output stays inside this workspace (calib/.tmp/).
// ============================================================

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { createChart } from "../src/parser/chartBuilder.js";
import { calculatePrimitives } from "../src/patterns/primitives.js";
import { computeDensityMetrics } from "../src/custom/density.js";
import { computeStaminaMetrics } from "../src/custom/staminaAnalysis.js";
import { computeTechMetrics } from "../src/custom/techAnalysis.js";

const ROOT = "D:/Users/Documents/GitHub/osumania_map_analyser/docs/data/files";

// ── index: name -> [pattern, subPattern] ──
const index = new Map<string, [string, string]>();
for (const line of readFileSync(join(ROOT, "file.csv"), "utf8").split(/\r?\n/).slice(1)) {
  const m = line.match(/^([^,]*),(.+),(\\w+),(.+),/);
  if (!m) continue;
  void m;
}
// file.csv has quoted-free simple CSV: bid,name,pattern,subPattern,expected,got,delta,deltaAbs
for (const line of readFileSync(join(ROOT, "file.csv"), "utf8").split(/\r?\n/).slice(1)) {
  const parts = line.split(",");
  if (parts.length < 4) continue;
  const name = parts[1]!;
  const pattern = parts[2]!;
  const sub = parts[3]!;
  index.set(name, [pattern, sub]);
}

function dtcv(starts: number[]): number {
  const rows: number[] = [];
  let prev = -1;
  for (const s of starts) {
    if (s === prev) continue;
    if (prev >= 0 && s - prev <= 2000) rows.push(s - prev);
    prev = s;
  }
  if (rows.length < 2) return 0;
  const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
  if (mean === 0) return 0;
  return Math.sqrt(rows.reduce((a, b) => a + (b - mean) ** 2, 0) / rows.length) / mean;
}

const dump: string[] = [];
const rows: Array<{ pat: string; sub: string; ent: number; sw: number; dt: number }> = [];

for (const pat of readdirSync(ROOT)) {
  const dir = join(ROOT, pat);
  let names: string[];
  try { names = readdirSync(dir); } catch { continue; }
  for (const f of names.filter(f => f.endsWith(".osu"))) {
    const key = f.replace(/\.osu$/, "");
    const meta = index.get(key);
    if (!meta) continue;
    try {
      const parser = new OsuFileParser(readFileSync(join(dir, f), "utf8"));
      parser.process();
      const parsed = parser.getParsedData();
      if (parsed.noteStarts.length < 20) continue;
      const primitives = calculatePrimitives(createChart(parsed), 1.0);
      const density = computeDensityMetrics(parsed, 1000, 1.0);
      const stamina = computeStaminaMetrics(parsed, density, 1.0, primitives);
      const tech = computeTechMetrics(parsed, { clusters: [], category: "Unknown", lnPercent: parsed.lnRatio * 100, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] }, 1.0, undefined, primitives);
      rows.push({ pat: meta[0], sub: meta[1], ent: tech.dtCV, sw: stamina.switchFrequency, dt: dtcv(parsed.noteStarts) });
      dump.push(`${meta[0]}\t${meta[1]}\t${key}\t${tech.dtCV.toFixed(3)}\t${stamina.switchFrequency}\t${dtcv(parsed.noteStarts).toFixed(3)}`);
    } catch { /* skip */ }
  }
}

function agg(label: string, rs: typeof rows): string {
  if (rs.length === 0) return "";
  const ent = rs.map(r => r.ent).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return `${label.padEnd(30)} n=${String(rs.length).padStart(3)}  ent ${mean(ent).toFixed(2)} [${ent[0]!.toFixed(2)}~${ent[ent.length - 1]!.toFixed(2)}]  sw ${mean(rs.map(r => r.sw)).toFixed(1)}  dt ${mean(rs.map(r => r.dt)).toFixed(2)}`;
}

const patterns = [...new Set(rows.map(r => r.pat))].sort();
console.log("== by pattern ==");
for (const p of patterns) console.log(agg(p, rows.filter(r => r.pat === p)));

console.log("\n== tech subtypes ==");
for (const sub of ["stream tech", "jack tech", "mix tech", "jacky tech", "Unsigned"]) {
  console.log(agg(sub, rows.filter(r => r.pat === "tech" && r.sub === sub)));
}

console.log("\n== major subPatterns (n>=10) ==");
const subCount = new Map<string, number>();
for (const r of rows) subCount.set(`${r.pat}/${r.sub}`, (subCount.get(`${r.pat}/${r.sub}`) ?? 0) + 1);
const majors = [...subCount.entries()].filter(([, n]) => n >= 10).map(([k]) => k).sort();
for (const k of majors) {
  const [p, s] = k.split("/");
  console.log(agg(k, rows.filter(r => r.pat === p && r.sub === s)));
}

writeFileSync("calib/.tmp/bench-entropy-dump.txt", "pattern\tsub\tname\tent\tsw\tdtCV\n" + dump.join("\n") + "\n");
console.log(`\nprocessed ${rows.length} charts, dump -> calib/.tmp/bench-entropy-dump.txt`);
