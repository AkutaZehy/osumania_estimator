import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPS_DIR = path.resolve(__dirname, "../maps");

const files = [
  "Toby Fox - Dan Signicial's Jack Pack (signupredir111) [Stage VI - Another Medium].osu",
  "Peng Gue-Xiang - Dan Signicial's Jack Pack (signupredir111) [Stage VII - Saltwater Chicken & Duck, Roasted Chicken & Duck (Ice Techno Remix)].osu",
  "Various Artists - Dan ~ REFORM ~ SpeedMap Pack (DDMythical) [Disconnected Trance ~ 9th ~ (Marathon)].osu",
  "Various Artists - Dan ~ REFORM ~ StaminaMap Pack (DDMythical) [Eternal Drain ~ 2nd ~ (Marathon)].osu",
  "Various Artists - Dan ~ REFORM ~ JackMap Pack (DDMythical) [CrossOver ~ 4th ~ (Marathon)].osu",
];

for (const file of files) {
  const short = file.match(/\[(.+?)\]/)?.[1] ?? file;
  const osuText = fs.readFileSync(path.join(MAPS_DIR, file), "utf-8");
  const parser = new OsuFileParser(osuText);
  parser.process();
  const bp = parser.getParsedData();

  const beatLength = bp.timingPoints.find((t) => t.beatLength > 0)?.beatLength ?? 1000;
  const measureLen = beatLength * 4;
  const first = bp.firstNote;

  console.log("=== " + short + " ===");

  // Analyze first 8 measures
  const numMeasures = Math.min(8, Math.ceil(bp.duration / measureLen));
  for (let m = 0; m < numMeasures; m++) {
    const mStart = first + m * measureLen;
    const mEnd = mStart + measureLen;
    const notesInMeasure = bp.noteStarts
      .map((t, i) => ({ t, col: bp.columns[i] }))
      .filter((n) => n.t >= mStart && n.t < mEnd);

    const colCounts = [0, 0, 0, 0];
    for (const n of notesInMeasure) colCounts[n.col]++;

    const total = notesInMeasure.length;
    const maxC = Math.max(...colCounts);
    const minC = Math.min(...colCounts);
    const imbalance = maxC / (minC + 1);

    console.log(
      `  M${m + 1}: notes=${total} cols=[${colCounts.join(",")}] max=${maxC} min=${minC} imbalance=${imbalance.toFixed(2)}`,
    );
  }
  console.log("");
}
