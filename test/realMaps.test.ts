// ============================================================
// Section Analysis — Test with REAL .osu maps
// ============================================================
// Run: npx tsx test/realMaps.test.ts
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeSections } from "../src/custom/sectionAnalysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPS_DIR = path.resolve(__dirname, "../maps");

// Map filename → expected classification (user provided)
const EXPECTED: Record<string, string> = {
  "Entelechia ~ 3rd ~ (Marathon).osu": "stream/low JS (大乱)",
  "Eternal Drain ~ 2nd ~ (Marathon).osu": "Mid JS with grace",
  "Elektric U-Phoria ~ 5th ~ (Marathon).osu": "High HS/JS",
  "Shannon's Theorem ~ 4th ~ (Marathon).osu": "Speedy Tech single stream",
  "Disconnected Trance ~ 9th ~ (Marathon).osu": "single stream (different divisions)",
  "CrossOver ~ 4th ~ (Marathon).osu": "minijack or jacky tech",
  "The Lost Dedicated ~ 10th ~ (Marathon).osu": "high CJ",
};

function getShortName(filename: string): string {
  // Extract the bracket part: [XXX ~ Nth ~ (Marathon)]
  const match = filename.match(/\[(.+?)\]/);
  return match ? match[1] : filename;
}

function main() {
  const files = fs.readdirSync(MAPS_DIR).filter((f) => f.endsWith(".osu"));

  console.log("Real Map Section Analysis Test");
  console.log("=".repeat(70));
  console.log(`Found ${files.length} maps\n`);

  for (const file of files) {
    const short = getShortName(file);
    const expected = Object.entries(EXPECTED).find(([k]) => file.includes(k))?.[1] ?? "—";

    const osuText = fs.readFileSync(path.join(MAPS_DIR, file), "utf-8");
    const parser = new OsuFileParser(osuText);
    parser.process();
    const beatmap = parser.getParsedData();

    const result = analyzeSections(beatmap);

    console.log(`[${short}]`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Duration: ${(result.totalDuration / 1000).toFixed(1)}s | Measures: ${result.totalMeasures} | Segments: ${result.segments.length}`);

    // Show dominant segments (skip tiny break segments)
    for (const seg of result.segments) {
      const durSec = ((seg.endTime - seg.startTime) / 1000).toFixed(1);
      const measureCount = seg.endMeasure - seg.startMeasure;
      const notesInSeg = seg.measures.reduce((s, m) => s + m.noteCount, 0);
      const notesPerBeat = measureCount > 0 ? (notesInSeg / (measureCount * 4)).toFixed(2) : "0";

      // Only show segments with at least 2 measures or non-break
      if (measureCount < 2 && seg.category === "break") continue;

      let detail = "";
      if (seg.category === "jack") {
        const cjCount = seg.measures.filter((m) => m.subType === "chordjack").length;
        const mjCount = seg.measures.filter((m) => m.subType === "minijack").length;
        detail = ` (CJ:${cjCount} MJ:${mjCount})`;
      } else if (seg.category === "stream") {
        const bulkCount = seg.measures.filter((m) => m.subType === "bulk").length;
        const jsCount = seg.measures.filter((m) => m.subType === "js").length;
        const hsCount = seg.measures.filter((m) => m.subType === "hs").length;
        const singleCount = seg.measures.filter((m) => m.subType === "single").length;
        const brokenCount = seg.measures.filter((m) => m.subType === "brokenjs").length;
        const parts: string[] = [];
        if (bulkCount > 0) parts.push(`bulk:${bulkCount}`);
        if (hsCount > 0) parts.push(`hs:${hsCount}`);
        if (jsCount > 0) parts.push(`js:${jsCount}`);
        if (singleCount > 0) parts.push(`single:${singleCount}`);
        if (brokenCount > 0) parts.push(`broken:${brokenCount}`);
        detail = parts.length > 0 ? ` (${parts.join(" ")})` : "";
      }

      // Show first measure structure
      const firstM = seg.measures[0];
      const structStr = firstM?.structure ? ` struct:${JSON.stringify(firstM.structure)}` : "";

      console.log(
        `  M${seg.startMeasure + 1}-M${seg.endMeasure} [${durSec}s] ${seg.category}/${seg.subType}: "${seg.patternStr}" n/beat=${notesPerBeat}${detail}${structStr}`,
      );
    }

    // Summary: measure category distribution
    const catCounts: Record<string, number> = {};
    for (const m of result.measures) {
      catCounts[m.category] = (catCounts[m.category] || 0) + 1;
    }
    const dist = Object.entries(catCounts)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    console.log(`  Distribution: ${dist}`);

    console.log("");
  }
}

main();
