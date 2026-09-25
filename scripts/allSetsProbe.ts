// ============================================================
// allSetsProbe.ts — colEntropy / switchFrequency / dtCV across
// ALL test chart sets, grouped, to validate the entropy verdict
// on the full corpus. Full dump -> calib/.tmp/allSets-dump.txt
// ============================================================

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { createChart } from "../src/parser/chartBuilder.js";
import { calculatePrimitives } from "../src/patterns/primitives.js";
import { computeDensityMetrics } from "../src/custom/density.js";
import { computeStaminaMetrics } from "../src/custom/staminaAnalysis.js";
import { computeTechMetrics } from "../src/custom/techAnalysis.js";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith(".osu")) out.push(p);
  }
  return out;
}

function groupOf(rel: string): string {
  const norm = rel.replace(/\\/g, "/");
  const parts = norm.split("/"); // maps/<top>/...
  const top = parts[1]!;
  if (top === "RFT") {
    const sub = parts[2] ?? "";
    const sub2 = parts[3] && parts.length > 4 ? `/${parts[3]}` : "";
    return `RFT/${sub}${sub2}`;
  }
  return top;
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

const files = walk("maps").sort();
const groups = new Map<string, Array<{ name: string; ent: number; sw: number; dt: number }>>();

for (const rel of files) {
  try {
    const parser = new OsuFileParser(readFileSync(rel, "utf8"));
    parser.process();
    const parsed = parser.getParsedData();
    if (parsed.noteStarts.length < 20) continue;
    const primitives = calculatePrimitives(createChart(parsed), 1.0);
    const density = computeDensityMetrics(parsed, 1000, 1.0);
    const stamina = computeStaminaMetrics(parsed, density, 1.0, primitives);
    const tech = computeTechMetrics(parsed, { clusters: [], category: "Unknown", lnPercent: parsed.lnRatio * 100, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] }, 1.0, undefined, primitives);
    const row = { name: rel.replace(/\\/g, "/").split("/").slice(1).join("/"), ent: tech.dtCV, sw: stamina.switchFrequency, dt: dtcv(parsed.noteStarts) };
    const g = groupOf(rel);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(row);
  } catch { /* skip broken */ }
}

const dump: string[] = [];
const stats: string[] = [];
console.log("group".padEnd(16), "n".padStart(4), "ent mean".padStart(9), "(min-max)".padStart(15), "sw mean".padStart(8), "dtCV mean".padStart(10));
for (const [g, rows] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const ents = rows.map(r => r.ent).sort((a, b) => a - b);
  const sws = rows.map(r => r.sw);
  const dts = rows.map(r => r.dt);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(
    g.padEnd(16), String(rows.length).padStart(4),
    mean(ents).toFixed(2).padStart(9),
    `${ents[0]!.toFixed(2)}~${ents[ents.length - 1]!.toFixed(2)}`.padStart(15),
    mean(sws).toFixed(1).padStart(8),
    mean(dts).toFixed(2).padStart(10),
  );
  stats.push(`${g}: n=${rows.length} entMean=${mean(ents).toFixed(2)} [${ents[0]!.toFixed(2)},${ents[ents.length - 1]!.toFixed(2)}] swMean=${mean(sws).toFixed(1)} dtMean=${mean(dts).toFixed(2)}`);
  for (const r of rows) dump.push(`${g}\t${r.name}\t${r.ent.toFixed(3)}\t${r.sw}\t${r.dt.toFixed(3)}`);
}
writeFileSync("calib/.tmp/allSets-dump.txt", "group\tname\tent\tsw\tdtCV\n" + dump.join("\n") + "\n");
console.log("\nfull dump -> calib/.tmp/allSets-dump.txt (" + dump.length + " rows)");
