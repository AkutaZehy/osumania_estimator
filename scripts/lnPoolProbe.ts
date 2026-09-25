// ============================================================
// lnPoolProbe.ts — dump LN pool components + scores per map
// to diagnose why only CO/DE ever win the argmax.
// ============================================================

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { computeLNMetrics } from "../src/custom/lnAnalysis.js";
import { computeTechMetrics } from "../src/custom/techAnalysis.js";

const NO_MODS = { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false };

function collectMaps(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".osu")) out.push(p);
    }
  };
  walk(root);
  return out;
}

function short(f: string): string {
  const base = f.split(/[\\/]/).pop()!;
  const m = base.match(/\[([^\]]+)\]\.osu$/);
  return (m ? m[1] : base).slice(0, 42);
}

const files = collectMaps("maps/LN").concat(collectMaps("maps/LN2"));
const tally: Record<string, number> = {};

console.log(
  "map".padEnd(44),
  "LNr".padStart(4),
  "ovN".padStart(5),
  "i%".padStart(5),
  "tp%".padStart(5),
  "s%".padStart(5),
  "c%".padStart(5),
  "|",
  "CO".padStart(6),
  "DE".padStart(6),
  "WC".padStart(6),
  "TE".padStart(6),
  "winner",
);

for (const f of files) {
  const text = readFileSync(f, "utf8");
  try {
    const parser = new OsuFileParser(text);
    parser.process();
    const parsed = parser.getParsedData();
    if (parsed.lnRatio < 0.15) continue; // only LN-dominant charts
    const sunny = calculateSunny(text, 1.0, NO_MODS, { withGraph: false });
    let patterns;
    try { patterns = analyzePatterns(parsed); } catch { patterns = null; }
    const pt = patterns ?? { clusters: [], category: "Unknown", lnPercent: parsed.lnRatio * 100, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] };
    const ln = computeLNMetrics(parsed, sunny, pt);
    const tech = computeTechMetrics(parsed, pt, 1.0);

    const lnN = Math.max(1, ln.totalLN);
    const notes = Math.max(1, parsed.noteStarts.length);
    const ovN = (ln.overlayCount / lnN) * 100;
    const i = (ln.inverseCount / lnN) * 100;
    const tp = (ln.tapLNCount / lnN) * 100;
    const s = (ln.shieldCount / lnN) * 100;
    const c = (ln.columnLockCount / lnN) * 100;
    const ch = (ln.lnChordCount / lnN) * 100;
    const wj = (ln.wcJackCount / lnN) * 100;
    const ws = (ln.wcSpeedCount / lnN) * 100;

    const pools: Array<[string, number]> = [
      ["CO", ln.coordinationPoolScore],
      ["DE", ln.densityPoolScore],
      ["WC", ln.wildcardPoolScore],
      ["TE", ln.technicalPoolScore],
    ];
    const max = pools.reduce((a, b) => (a[1] > b[1] ? a : b));
    const allZero = pools.every(([, v]) => v <= 0);
    let winner = allZero ? "-" : max[0];
    // display.dominantLNPool gate: absolute floor 15 only (components are
    // designed to overlap, so a close runner-up is normal — no margin gate)
    if (winner !== "-") {
      const ranked = [...pools].sort((a, b) => b[1] - a[1]);
      if (ranked[0]![1]! < 15) winner = "null";
    }
    tally[winner] = (tally[winner] ?? 0) + 1;

    console.log(
      short(f).padEnd(44),
      parsed.lnRatio.toFixed(2).padStart(4),
      ovN.toFixed(1).padStart(5),
      i.toFixed(1).padStart(5),
      tp.toFixed(1).padStart(5),
      ch.toFixed(1).padStart(5),
      (wj + ws).toFixed(1).padStart(5),
      "|",
      ln.coordinationPoolScore.toFixed(1).padStart(6),
      ln.densityPoolScore.toFixed(1).padStart(6),
      ln.wildcardPoolScore.toFixed(1).padStart(6),
      ln.technicalPoolScore.toFixed(1).padStart(6),
      tech.dtCV.toFixed(2).padStart(5),
      winner,
    );
  } catch (e) {
    console.log(short(f).padEnd(44), "ERROR", (e as Error).message.slice(0, 60));
  }
}

console.log("\n=== winner tally ===");
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(k, v);
