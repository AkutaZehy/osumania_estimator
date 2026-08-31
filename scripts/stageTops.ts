import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";
import { computeCustomMetrics } from "../src/custom/customMetrics.js";

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

const rows: Array<Record<string, number | string>> = [];
for (const f of maps) {
  const text = readFileSync(f, "utf8");
  try {
    const parser = new OsuFileParser(text); parser.process();
    const parsed = parser.getParsedData();
    const sunny = calculateSunny(text, 1.0, NO_MODS, { withGraph: true });
    let pt: unknown = null, patMs = 0;
    const s1 = performance.now();
    try { pt = analyzePatterns(parsed); } catch { /* */ }
    patMs = performance.now() - s1;
    const s2 = performance.now();
    let grid: unknown = null;
    try { grid = analyzeGrid(parsed, undefined, 1.0); } catch { /* */ }
    const gridMs = performance.now() - s2;
    const s3 = performance.now();
    try {
      computeCustomMetrics(parsed, sunny, pt ?? { clusters: [], category: "Unknown", lnPercent: 0, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] }, 1.0, grid as never);
    } catch { /* */ }
    const custMs = performance.now() - s3;
    rows.push({ f: f.split(/[\/]/).slice(-2).join("/"), notes: parsed.noteStarts.length, patterns: patMs, grid: gridMs, custom: custMs, sunny: 0 });
    rows[rows.length - 1]!.sunny = 0;
  } catch { /* */ }
}
for (const k of ["patterns", "grid", "custom"]) {
  console.log(`\n== worst 5 by ${k}:`);
  [...rows].sort((a, b) => (b[k] as number) - (a[k] as number)).slice(0, 5)
    .forEach((r) => console.log(`  ${(r[k] as number).toFixed(0).padStart(5)}ms  n=${String(r.notes).padStart(5)}  ${r.f}`));
}
