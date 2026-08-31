import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { computeCustomMetrics } from "../src/custom/customMetrics.js";
import { computeDensityMetrics } from "../src/custom/density.js";
import { computeJackMetrics } from "../src/custom/jackAnalysis.js";
import { computeStreamMetrics } from "../src/custom/streamAnalysis.js";
import { computeTechMetrics } from "../src/custom/techAnalysis.js";
import { computeStaminaMetrics } from "../src/custom/staminaAnalysis.js";

const NO_MODS = { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false };
const walk = (dir: string, out: string[]): void => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".osu")) out.push(p);
  }
};
const maps: string[] = [];
walk("maps/LN", maps);
walk("maps/LN2", maps);

let mismatches = 0;
for (const f of maps) {
  const text = readFileSync(f, "utf8");
  try {
    const parser = new OsuFileParser(text);
    parser.process();
    const parsed = parser.getParsedData();
    const sunny = calculateSunny(text, 1.0, NO_MODS, { withGraph: true });
    let patterns;
    try { patterns = analyzePatterns(parsed); } catch { patterns = null; }
    const pt = patterns ?? { clusters: [], category: "Unknown", lnPercent: 0, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] };

    // Shared path (new)
    const shared = computeCustomMetrics(parsed, sunny, pt, 1.0, null);
    // Standalone path (old behavior)
    const density = computeDensityMetrics(parsed, 1000, 1.0);
    const jack = computeJackMetrics(parsed, density, 1.0);
    const stream = computeStreamMetrics(parsed, density, 1.0);
    const tech = computeTechMetrics(parsed, pt, 1.0, undefined);
    const stamina = computeStaminaMetrics(parsed, density, 1.0);
    const standalone = { ...shared, jack, stream, tech, stamina };

    const s = JSON.stringify(shared);
    const t = JSON.stringify(standalone);
    if (s !== t) {
      mismatches++;
      // Find first differing key path
      const sk = JSON.parse(s), tk = JSON.parse(t);
      const diffKeys: string[] = [];
      const scan = (a: unknown, b: unknown, path: string): void => {
        if (JSON.stringify(a) === JSON.stringify(b)) return;
        if (typeof a !== "object" || a === null) { diffKeys.push(path); return; }
        for (const k of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) {
          scan((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
        }
      };
      scan(sk, tk, "root");
      console.log(`MISMATCH: ${f.split(/[\/]/).slice(-1)[0]}  keys=${diffKeys.slice(0, 6).join(", ")}`);
    }
  } catch (e) { console.log(`ERR ${f}: ${String(e).slice(0, 80)}`); }
}
console.log(`\n${maps.length} maps, ${mismatches} mismatches`);
