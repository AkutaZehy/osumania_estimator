// ============================================================
// bench.ts — full-map benchmark runner (npm run bench)
// Runs the complete analyzeBeatmap pipeline over every .osu in maps/,
// reports latency percentiles and the heaviest maps. Pass --stages for
// a per-stage breakdown (parse / sunny / patterns / grid / custom / sections).
// ============================================================

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeBeatmap } from "../src/integration/analyzer.js";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";
import { computeCustomMetrics } from "../src/custom/customMetrics.js";
import { analyzeSections } from "../src/custom/sectionAnalysis.js";

const STAGES = process.argv.includes("--stages");
const DIR_ARG = process.argv.indexOf("--dir");
const ROOT = DIR_ARG >= 0 ? process.argv[DIR_ARG + 1] ?? "maps" : "maps";
const NO_MODS = { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false };

function collectMaps(root = "maps"): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        // Never benchmark the stress-map folder (far beyond the 30000-note
        // guard; user explicitly marked it do-not-touch).
        if (e.name === "NEVER TEST IT UNLESS I ASKED YOU") continue;
        walk(p);
      }
      else if (e.name.endsWith(".osu")) out.push(p);
    }
  };
  walk(root);
  return out;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`;
}

function summarize(label: string, sorted: number[]): void {
  if (sorted.length === 0) return;
  console.log(
    `${label.padEnd(14)} n=${String(sorted.length).padStart(3)}  min ${fmt(sorted[0]!).padStart(8)}  p50 ${fmt(pct(sorted, 0.5)).padStart(8)}  p90 ${fmt(pct(sorted, 0.9)).padStart(8)}  p99 ${fmt(pct(sorted, 0.99)).padStart(8)}  max ${fmt(sorted[sorted.length - 1]!).padStart(8)}`,
  );
}

function main(): void {
  const maps = collectMaps(ROOT);
  console.log(`bench: ${maps.length} maps (${STAGES ? "--stages mode" : "full pipeline"})\n`);

  if (STAGES) {
    // Per-stage breakdown (mirrors the analyzer pipeline order)
    const acc: Record<string, number[]> = { parse: [], sunny: [], patterns: [], grid: [], custom: [], sections: [], total: [] };
    let errors = 0;
    for (const f of maps) {
      const text = readFileSync(f, "utf8");
      try {
        let s = performance.now();
        const parser = new OsuFileParser(text);
        parser.process();
        acc.parse.push(performance.now() - s);
        const parsed = parser.getParsedData();

        s = performance.now();
        const sunny = calculateSunny(text, 1.0, NO_MODS, { withGraph: true });
        acc.sunny.push(performance.now() - s);

        s = performance.now();
        let patterns;
        try { patterns = analyzePatterns(parsed); } catch { patterns = null; }
        acc.patterns.push(performance.now() - s);

        s = performance.now();
        let grid = null;
        try { grid = analyzeGrid(parsed, undefined, 1.0); } catch { grid = null; }
        acc.grid.push(performance.now() - s);

        s = performance.now();
        try {
          computeCustomMetrics(parsed, sunny, patterns ?? { clusters: [], category: "Unknown", lnPercent: parsed.lnRatio * 100, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] }, 1.0, grid);
        } catch { /* tolerate */ }
        acc.custom.push(performance.now() - s);

        s = performance.now();
        try { analyzeSections(parsed, undefined); } catch { /* tolerate */ }
        acc.sections.push(performance.now() - s);

        acc.total.push(acc.parse[acc.parse.length - 1]! + acc.sunny[acc.sunny.length - 1]! + acc.patterns[acc.patterns.length - 1]! + acc.grid[acc.grid.length - 1]! + acc.custom[acc.custom.length - 1]! + acc.sections[acc.sections.length - 1]!);
      } catch { errors++; }
    }
    for (const k of ["total", "parse", "sunny", "patterns", "grid", "custom", "sections"]) {
      summarize(k, acc[k]!.sort((a, b) => a - b));
    }
    console.log(`\nerrors: ${errors}`);
    return;
  }

  // Full-pipeline mode
  const times: Array<{ f: string; ms: number; star: number }> = [];
  let rejected = 0;
  let errors = 0;
  for (const f of maps) {
    const text = readFileSync(f, "utf8");
    try {
      const t0 = performance.now();
      const r = analyzeBeatmap(text, { speedRate: 1.0, modFlags: NO_MODS });
      const ms = performance.now() - t0;
      if (r.finalStar < 0) rejected++;
      times.push({ f, ms, star: r.finalStar });
    } catch { errors++; }
  }
  const sorted = times.map(t => t.ms).sort((a, b) => a - b);
  summarize("total", sorted);
  summarize("rejected", []);
  console.log(`rejected/guarded: ${rejected}  errors: ${errors}`);
  console.log("\nheaviest 10:");
  [...times].sort((a, b) => b.ms - a.ms).slice(0, 10)
    .forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${fmt(t.ms).padStart(8)}  star ${t.star.toFixed(2).padStart(6)}  ${t.f.split(/[\\/]/).slice(-2).join("/")}`));
}

main();
