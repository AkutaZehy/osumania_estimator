/**
 * Test script: run grid analysis on all maps/ .osu files
 * and report BPM, key type, and note counts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";
import type { ParsedBeatmap } from "../src/types/beatmap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mapsDir = resolve(__dirname, "../maps");
const mapFiles = readdirSync(mapsDir).filter((f) => f.endsWith(".osu"));

function getBPM(beatmap: import("../src/types/beatmap.js").ParsedBeatmap): number {
  const uninherited = beatmap.timingPoints.find((tp) => tp.uninherited);
  if (uninherited && uninherited.beatLength > 0) {
    return Math.round((60000 / uninherited.beatLength) * 100) / 100;
  }
  return 120;
}

console.log("=".repeat(100));
console.log("GRID ANALYSIS TEST — ALL MAPS");
console.log("=".repeat(100));

for (const file of mapFiles) {
  const fullPath = join(mapsDir, file);
  let content: string;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch (e) {
    console.log(`\n❌ CANNOT READ: ${file} — ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }

  const parser = new OsuFileParser(content);
  parser.process();
  const beatmap = parser.getParsedData();

  const rawBPM = getBPM(beatmap);
  const noteCount = beatmap.noteStarts.length;
  const title = `${beatmap.metadata.artist} - ${beatmap.metadata.title} [${beatmap.metadata.version}]`;

  console.log(`\n${"-".repeat(80)}`);
  console.log(`📄 ${title}`);
  console.log(`   Notes: ${noteCount} | Keys: ${beatmap.columnCount}K | rawBPM: ${rawBPM}`);

  if (noteCount > 5000) {
    console.log(`   ⚠️  > 5000 notes — grid analysis SKIPPED`);
    continue;
  }

  try {
    const result = analyzeGrid(beatmap);
    if (!result) {
      console.log(`   ⚠️  analyzeGrid returned null`);
      continue;
    }

    // BPM range
    console.log(`   BPM range: ${result.bpmRange.min} - ${result.bpmRange.max}`);

    // Main key type
    const main = result.mainKeyType;
    console.log(`   🏆 Main: ${main.keyType} @ ${main.bpm}BPM (${main.percentage.toFixed(1)}%, ${main.cellCount} cells)`);

    // Top 5 BPM-key type breakdowns
    console.log(`   Breakdown (top 5):`);
    const top5 = result.bpmKeyTypes.slice(0, 5);
    for (const bkt of top5) {
      console.log(`     ${bkt.keyType.padEnd(20)} ${String(bkt.bpm).padStart(4)} BPM  ${bkt.percentage.toFixed(1)}%  (${bkt.cellCount} cells)`);
    }

    // Cell category distribution
    const catCounts: Record<string, number> = {};
    for (const cell of result.cells) {
      catCounts[cell.category] = (catCounts[cell.category] ?? 0) + 1;
    }
    const totalCells = result.cells.length;
    const catStr = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, cnt]) => `${cat}: ${cnt} (${(cnt / totalCells * 100).toFixed(1)}%)`)
      .join(" | ");
    console.log(`   Cells: ${totalCells} total — ${catStr}`);

    // Subdivision distribution
    const subdivCounts: Record<string, number> = {};
    for (const cell of result.cells) {
      if (cell.category === "break" || cell.category === "ln") continue;
      const key = cell.subdivision != null ? `denom=${cell.subdivision}` : "null";
      subdivCounts[key] = (subdivCounts[key] ?? 0) + 1;
    }
    const subdivStr = Object.entries(subdivCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
    console.log(`   Subdiv: ${subdivStr}`);

  } catch (e) {
    console.log(`   ❌ ERROR: ${e}`);
  }
}

console.log(`\n${"=".repeat(100)}`);
console.log("DONE");
