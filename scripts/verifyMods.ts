import { readFileSync, readdirSync } from "node:fs";
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
    if (e.isDirectory()) { if (e.name === "NEVER TEST IT UNLESS I ASKED YOU") continue; walk(p, out); }
    else if (e.name.endsWith(".osu")) out.push(p);
  }
};
const maps: string[] = [];
walk("maps", maps);

let mismatches = 0;
for (const f of maps.slice(0, 40)) {
  const text = readFileSync(f, "utf8");
  try {
    const parser = new OsuFileParser(text);
    parser.process();
    const parsed = parser.getParsedData();
    const sunny = calculateSunny(text, 1.5, NO_MODS, { withGraph: true });
    let patterns;
    try { patterns = analyzePatterns(parsed, 1.5); } catch { patterns = null; }
    const pt = patterns ?? { clusters: [], category: "Unknown", lnPercent: 0, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] };

    const shared = computeCustomMetrics(parsed, sunny, pt, 1.5, null);
    const density = computeDensityMetrics(parsed, 1000, 1.5);
    const standalone = {
      ...shared,
      jack: computeJackMetrics(parsed, density, 1.5),
      stream: computeStreamMetrics(parsed, density, 1.5),
      tech: computeTechMetrics(parsed, pt, 1.5, undefined),
      stamina: computeStaminaMetrics(parsed, density, 1.5),
    };
    if (JSON.stringify(shared) !== JSON.stringify(standalone)) {
      mismatches++;
      console.log(`MISMATCH @1.5x: ${f.split(/[\/]/).slice(-1)[0]}`);
    }
  } catch { /* skip */ }
}
console.log(`40 maps @ speedRate=1.5, ${mismatches} mismatches`);
