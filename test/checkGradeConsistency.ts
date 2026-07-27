/**
 * Check grade consistency across different speed versions of the same map.
 * Same pattern → same grade expected.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBeatmap } from "../src/integration/analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mapsDir = resolve(__dirname, "../maps");

const files = [
  "Haddaway - What Is Love (H4chyk0) [0.8x  don't hurt me, no more].osu",
  "Haddaway - What Is Love (H4chyk0) [1.0x  don't hurt me, no more].osu",
  "Haddaway - What Is Love (H4chyk0) [1.1x  don't hurt me, no more].osu",
  "Haddaway - What Is Love (H4chyk0) [1.2x  don't hurt me, no more].osu",
  "Haddaway - What Is Love (H4chyk0) [1.3x  don't hurt me, no more].osu",
  "Haddaway - What Is Love (H4chyk0) [1.4x  don't hurt me, no more].osu",
];

import { gradeJack, gradeStream } from "../src/custom/gridAnalysis.js";
import type { DifficultyResult } from "../src/types/result.js";

function aggregateGridGrade(ga: DifficultyResult["gridAnalysis"], category: "jack" | "stream"): string | null {
  if (!ga) return null;
  const relevant = ga.segments.filter((s) => s.category === category);
  if (relevant.length === 0) return null;

  const values: number[] = [];
  for (const seg of relevant) {
    const weight = seg.cells.length;
    const val = seg.gridTotalNotes;
    for (let i = 0; i < weight; i++) values.push(val);
  }

  const sorted = [...values].sort((a, b) => a - b);
  const topIdx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1);
  const topVal = Math.round(sorted[topIdx]!);
  const medIdx = Math.floor(sorted.length * 0.5);
  const median = sorted.length > 0 ? sorted[medIdx]! : 0;

  if (category === "jack") return gradeJack(topVal, median);
  const avgPerRow = topVal / 4;
  if (avgPerRow <= 1.125) return `Single (${topVal.toFixed(1)}/${median.toFixed(1)})`;
  if (avgPerRow <= 1.25) return `Light (${topVal.toFixed(1)}/${median.toFixed(1)})`;
  if (avgPerRow <= 1.5) return `Mid (${topVal.toFixed(1)}/${median.toFixed(1)})`;
  if (avgPerRow < 2.0) return `Dense (${topVal.toFixed(1)}/${median.toFixed(1)})`;
  if (avgPerRow === 2.0) return `Full (${topVal.toFixed(1)}/${median.toFixed(1)})`;
  return `Heavy (${topVal.toFixed(1)}/${median.toFixed(1)})`;
}

// Also get custom metrics grade
function customGrade(result: DifficultyResult, category: "jack" | "stream"): string | null {
  if (category === "jack") return result.custom.jack.densityGrade;
  return result.custom.stream.densityGrade;
}

console.log("=".repeat(100));
console.log("GRADE CONSISTENCY CHECK — What Is Love @ different speeds");
console.log("=".repeat(100));

for (const file of files) {
  const fullPath = resolve(mapsDir, file);
  const content = readFileSync(fullPath, "utf-8");
  const result = analyzeBeatmap(content);

  const ga = result.gridAnalysis;
  const jackGrid = aggregateGridGrade(ga, "jack");
  const streamGrid = aggregateGridGrade(ga, "stream");
  const jackCustom = customGrade(result, "jack");
  const streamCustom = customGrade(result, "stream");

  // Find some cell stats
  let jackCells = 0, streamCells = 0, totalCells = 0;
  if (ga) {
    for (const seg of ga.segments) {
      if (seg.category === "jack") jackCells += seg.cells.length;
      else if (seg.category === "stream") streamCells += seg.cells.length;
      totalCells += seg.cells.length;
    }
  }

  const version = file.match(/\[(.+)\]/)?.[1] ?? file;

  console.log(`\n${version}`);
  console.log(`  BPM: ${result.meta.bpm}`);
  console.log(`  Cells: ${totalCells} (jack=${jackCells}, stream=${streamCells})`);
  console.log(`  JACK grade (grid):     ${jackGrid ?? "—"}`);
  console.log(`  JACK grade (custom):   ${jackCustom ?? "—"}`);
  console.log(`  STREAM grade (grid):   ${streamGrid ?? "—"}`);
  console.log(`  STREAM grade (custom): ${streamCustom ?? "—"}`);

  // Show gridTotalNotes values for jack segments
  if (ga) {
    const jackSegs = ga.segments.filter(s => s.category === "jack");
    if (jackSegs.length > 0) {
      const vals = jackSegs.flatMap(s => Array(s.cells.length).fill(s.gridTotalNotes));
      const maxVal = Math.max(...vals);
      const minVal = Math.min(...vals);
      const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
      console.log(`  Jack gridTotalNotes: min=${minVal} max=${maxVal} avg=${avgVal.toFixed(1)} (${vals.length} samples)`);
    }
  }
}

console.log(`\n${"=".repeat(100)}`);
