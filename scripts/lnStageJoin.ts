// ============================================================
// lnStageJoin.ts — join classify8thAndBelow expected per-map
// labels (from its SUMMARY table) with current pool winners.
// Usage: run test/classify8thAndBelow bundle first:
//   esbuild test/classify8thAndBelow.test.ts --outfile=test/.tmp-c8.mjs && node test/.tmp-c8.mjs > calib/.tmp/classify8-full.txt
// ============================================================

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { calculateSunny } from "../src/algorithm/sunnyRework.js";
import { analyzePatterns } from "../src/patterns/summary.js";
import { computeLNMetrics } from "../src/custom/lnAnalysis.js";

const NO_MODS = { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false };
const FLOOR = 15;

// ── parse expected labels from classify8 SUMMARY table ──
const expected = new Map<string, string>();
const summaryPath = "calib/.tmp/classify8-full.txt";
const lines = readFileSync(summaryPath, "utf8").split(/\r?\n/);
for (const line of lines) {
  const m = line.match(/^\s*S(\d) \| \d+th \| (.+?)\s*\| \d+BPM\s*\|.*\|\s*(CO|DE|WC|TE)\//);
  if (!m) continue;
  expected.set(`S${m[1]}|${m[2]!.trimEnd()}`, m[3]!);
}

// ── current winners ──
function shortOf(f: string): string {
  const m = f.match(/\[([^\]]+)\]\.osu$/);
  return (m ? m[1] : f).replace(/\s*\(Marathon\)\s*$/, "");
}

const files = readdirSync("maps/LN").filter(f => f.endsWith(".osu"));
const tally: Record<string, Record<string, number>> = {};
let hit = 0, total = 0;
const misses: string[] = [];

for (const f of files) {
  const stageM = f.match(/Stage (\d)/);
  if (!stageM) continue;
  const stage = Number(stageM[1]);
  const key = `S${stage}|${shortOf(f).slice(0, 30)}`;
  const exp = expected.get(key);
  if (!exp) continue;

  const text = readFileSync(join("maps/LN", f), "utf8");
  const parser = new OsuFileParser(text);
  parser.process();
  const parsed = parser.getParsedData();
  if (parsed.lnRatio < 0.15) continue;
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

  // raw components for discriminant analysis
  const lnN = Math.max(1, ln.totalLN);
  const arPct = (ln.asyncReleaseCount / lnN) * 100;
  const rPct = (ln.releaseCount / lnN) * 100;
  const tpPct = (ln.tapLNCount / lnN) * 100;
  const ovPct = (ln.overlayCount / lnN) * 100;
  const iPct = (ln.inverseCount / lnN) * 100;
  const chPct = (ln.lnChordCount / lnN) * 100;
  const wjws = ((ln.wcJackCount + ln.wcSpeedCount) / lnN) * 100;
  const sPct = (ln.shieldCount / lnN) * 100;
  const cPct = (ln.columnLockCount / lnN) * 100;

  total++;
  tally[stage] ??= {};
  tally[stage]![`${exp}>${winner}`] = (tally[stage]![`${exp}>${winner}`] ?? 0) + 1;
  if (winner === exp) hit++;
  else misses.push(`S${stage} ${shortOf(f).slice(0, 30).padEnd(30)} ${exp}>${winner} | ar${arPct.toFixed(0)} r${rPct.toFixed(0)} tp${tpPct.toFixed(0)} ov${ovPct.toFixed(0)} inv${iPct.toFixed(0)} ch${chPct.toFixed(0)} wc${wjws.toFixed(0)} s${sPct.toFixed(0)} c${cPct.toFixed(0)}`);
}

console.log(`hit ${hit}/${total} = ${(hit / Math.max(1, total) * 100).toFixed(0)}%  (expected = classify8 per-map inference main)\n`);
for (const s of [1, 2, 3, 4]) {
  const t = tally[s] ?? {};
  console.log(`Stage ${s}:`, Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));
}
console.log("\nmisses:");
for (const m of misses) console.log(" ", m);
