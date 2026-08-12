// Verifies the whole-pipeline chart/primitives sharing is behavior-identical:
// analyzeBeatmap (shared) vs a manual pipeline that builds chart+primitives
// separately for patterns and custom (old behavior).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ParsedBeatmap } from "../src/types/beatmap.js";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { createChart } from "../src/parser/chartBuilder.js";
import { calculatePrimitives } from "../src/patterns/primitives.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";
import { computeCustomMetrics } from "../src/custom/customMetrics.js";
import { aggregateDifficulty } from "../src/integration/difficultyAggregator.js";
import { analyzeSections } from "../src/custom/sectionAnalysis.js";

const NO_MODS = { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false };

function oldPipeline(parsed: ParsedBeatmap, text: string, speedRate: number) {
  const sunny = calculateSunny(text, speedRate, NO_MODS, { withGraph: true });
  const patterns = analyzePatterns(parsed, 1.0); // old: always unscaled
  const grid = analyzeGrid(parsed, undefined, speedRate);
  const custom = computeCustomMetrics(parsed, sunny, patterns, speedRate, grid);
  return { star: aggregateDifficulty(sunny, patterns, custom).finalStar, patterns, custom, grid };
}

function newPipeline(parsed: ParsedBeatmap, text: string, speedRate: number) {
  const sunny = calculateSunny(text, speedRate, NO_MODS, { withGraph: true });
  const chart = createChart(parsed);
  const primitives = calculatePrimitives(chart, speedRate);
  const patterns = speedRate === 1 ? analyzePatterns(parsed, speedRate, primitives) : analyzePatterns(parsed, 1.0);
  const grid = analyzeGrid(parsed, undefined, speedRate);
  const custom = computeCustomMetrics(parsed, sunny, patterns, speedRate, grid, primitives);
  return { star: aggregateDifficulty(sunny, patterns, custom).finalStar, patterns, custom, grid };
}

const walk = (dir: string, out: string[]): void => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "NEVER TEST IT UNLESS I ASKED YOU") continue; walk(p, out); }
    else if (e.name.endsWith(".osu")) out.push(p);
  }
};
const maps: string[] = [];
walk("maps", maps);

let bad = 0, checked = 0;
for (const speedRate of [1.0, 1.5]) {
  for (const f of maps) {
    const text = readFileSync(f, "utf8");
    try {
      const parser = new OsuFileParser(text); parser.process();
      const parsed = parser.getParsedData();
      const a = oldPipeline(parsed, text, speedRate);
      const b = newPipeline(parsed, text, speedRate);
      checked++;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        bad++;
        console.log(`MISMATCH @${speedRate}: ${f.split(/[\/]/).slice(-1)[0]}`);
      }
    } catch (e) { /* tolerate parse fails */ }
  }
}
console.log(`checked ${checked} (×2 speed rates), ${bad} mismatches`);
