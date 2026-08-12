// ============================================================
// profileLN.ts — per-subfunction profile of the custom stage
// on LN maps, to locate the LN pressure hot spots.
// ============================================================

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { computeLNMetrics } from "../src/custom/lnAnalysis.js";
import { computeCustomMetrics } from "../src/custom/customMetrics.js";
import { computeAnchorMetrics } from "../src/custom/anchorAnalysis.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";

const NO_MODS = { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false };

function collectMaps(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".osu")) out.push(p);
    }
  };
  walk(root);
  return out;
}

const acc: Record<string, number[]> = { custom: [], ln: [], anchor: [], grid: [] };
const dump: Array<Record<string, number | string>> = [];

for (const f of collectMaps("maps/LN").concat(collectMaps("maps/LN2"))) {
  const text = readFileSync(f, "utf8");
  try {
    const parser = new OsuFileParser(text);
    parser.process();
    const parsed = parser.getParsedData();
    const sunny = calculateSunny(text, 1.0, NO_MODS, { withGraph: true });
    let patterns;
    try { patterns = analyzePatterns(parsed); } catch { patterns = null; }
    const pt = patterns ?? { clusters: [], category: "Unknown", lnPercent: parsed.lnRatio * 100, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] };
    const row: Record<string, number | string> = { f: f.split(/[\\/]/).slice(-1)[0]!, notes: parsed.noteStarts.length };

    const t = (label: string, fn: () => unknown): void => {
      const s = performance.now();
      try { fn(); } catch { /* tolerate */ }
      const ms = performance.now() - s;
      acc[label]!.push(ms);
      row[label] = ms;
    };

    // Real-world path: computeCustomMetrics shares one chart+primitives
    // across jack/stream/tech/stamina.
    t("custom", () => computeCustomMetrics(parsed, sunny, pt, 1.0, null));
    t("ln", () => computeLNMetrics(parsed, sunny, pt));
    t("grid", () => analyzeGrid(parsed, undefined, 1.0));
    t("anchor", () => computeAnchorMetrics(parsed, null));
    dump.push(row);
  } catch { /* skip */ }
}

for (const k of ["custom", "ln", "grid", "anchor"]) {
  const v = acc[k]!.sort((a, b) => a - b);
  console.log(`${k.padEnd(8)} n=${v.length}  p50 ${v[Math.floor(v.length * 0.5)]!.toFixed(1)}  p90 ${v[Math.floor(v.length * 0.9)]!.toFixed(1)}  max ${v[v.length - 1]!.toFixed(1)}`);
}
console.log("\nworse 8 by custom:");
dump.sort((a, b) => (b.custom as number) - (a.custom as number)).slice(0, 8)
  .forEach((d) => console.log(`  custom ${(d.custom as number).toFixed(0).padStart(5)}ms  ln ${(d.ln as number).toFixed(1).padStart(4)}  n=${d.notes}  ${d.f}`));