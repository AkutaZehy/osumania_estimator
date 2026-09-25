// ============================================================
// lnStageCheck.ts — current LN pool winners vs the stage
// expectations recorded in test/classify8thAndBelow.test.ts
//   Stage 1 → CO (Basic)          Stage 2 → TE (Release/Tech)
//   Stage 3 → DE (Inverse/Wall)   Stage 4 → WC (Speed/Wildcard)
// ============================================================

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { computeLNMetrics } from "../src/custom/lnAnalysis.js";

const NO_MODS = { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false };
const EXPECTED: Record<number, string> = { 1: "CO", 2: "TE/CO", 3: "DE", 4: "WC" };
const FLOOR = 15;

const files = readdirSync("maps/LN").filter(f => f.endsWith(".osu")).sort();
const perStage: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {} };

for (const f of files) {
  const stageM = f.match(/Stage (\d)/);
  if (!stageM) continue;
  const stage = Number(stageM[1]);
  const text = readFileSync(join("maps/LN", f), "utf8");
  try {
    const parser = new OsuFileParser(text);
    parser.process();
    const parsed = parser.getParsedData();
    if (parsed.lnRatio < 0.15) { console.log(`S${stage}`, short(f).padEnd(40), "lnRatio<0.15 skip"); continue; }
    const sunny = calculateSunny(text, 1.0, NO_MODS, { withGraph: false });
    let patterns;
    try { patterns = analyzePatterns(parsed); } catch { patterns = null; }
    const pt = patterns ?? { clusters: [], category: "Unknown", lnPercent: parsed.lnRatio * 100, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] };
    const ln = computeLNMetrics(parsed, sunny, pt);

    const pools: Array<[string, number]> = [
      ["CO", ln.coordinationPoolScore],
      ["DE", ln.densityPoolScore],
      ["WC", ln.wildcardPoolScore],
      ["TE", ln.technicalPoolScore],
    ];
    const ranked = [...pools].sort((a, b) => b[1] - a[1]);
    let winner = ranked[0]![0]!;
    if (ranked[0]![1]! < FLOOR) winner = "null";
    perStage[stage]![winner] = (perStage[stage]![winner] ?? 0) + 1;

    const hit = EXPECTED[stage]!.includes(winner) ? "ok" : "MISS";
    console.log(
      `S${stage}`, short(f).padEnd(40),
      `CO ${ln.coordinationPoolScore.toFixed(0).padStart(3)}`,
      `DE ${ln.densityPoolScore.toFixed(0).padStart(3)}`,
      `WC ${ln.wildcardPoolScore.toFixed(0).padStart(3)}`,
      `TE ${ln.technicalPoolScore.toFixed(0).padStart(3)}`,
      `→ ${winner.padEnd(4)}`, hit,
    );
  } catch (e) {
    console.log(`S${stage}`, short(f).padEnd(40), "ERROR", (e as Error).message.slice(0, 50));
  }
}

console.log("\n=== per-stage tally (expect S1 CO, S2 TE/CO, S3 DE, S4 WC) ===");
for (const s of [1, 2, 3, 4]) {
  const t = perStage[s]!;
  console.log(`Stage ${s} (expect ${EXPECTED[s]}):`, Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  "));
}

function short(f: string): string {
  const m = f.match(/\[([^\]]+)\]\.osu$/);
  return (m ? m[1] : f).slice(0, 40);
}
