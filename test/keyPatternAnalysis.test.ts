import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPS_DIR = path.resolve(__dirname, "../maps");

const files = [
  ["Stage VI", "Toby Fox - Dan Signicial's Jack Pack (signupredir111) [Stage VI - Another Medium].osu"],
  ["Stage VII", "Peng Gue-Xiang - Dan Signicial's Jack Pack (signupredir111) [Stage VII - Saltwater Chicken & Duck, Roasted Chicken & Duck (Ice Techno Remix)].osu"],
  ["CrossOver", "Various Artists - Dan ~ REFORM ~ JackMap Pack (DDMythical) [CrossOver ~ 4th ~ (Marathon)].osu"],
  ["Disconnected Trance", "Various Artists - Dan ~ REFORM ~ SpeedMap Pack (DDMythical) [Disconnected Trance ~ 9th ~ (Marathon)].osu"],
  ["Eternal Drain", "Various Artists - Dan ~ REFORM ~ StaminaMap Pack (DDMythical) [Eternal Drain ~ 2nd ~ (Marathon)].osu"],
];

for (const [label, file] of files) {
  const osuText = fs.readFileSync(path.join(MAPS_DIR, file), "utf-8");
  const parser = new OsuFileParser(osuText);
  parser.process();
  const bp = parser.getParsedData();
  const beatLength = bp.timingPoints.find((t) => t.beatLength > 0)?.beatLength ?? 1000;
  const measureLen = beatLength * 4;
  const first = bp.firstNote;

  console.log(`=== ${label} ===`);

  // Check first 4 measures: show per-beat column occupancy
  for (let m = 0; m < 4; m++) {
    const mStart = first + m * measureLen;
    const mEnd = mStart + measureLen;
    const notesInMeasure = bp.noteStarts
      .map((t, i) => ({ t, col: bp.columns[i] }))
      .filter((n) => n.t >= mStart && n.t < mEnd);

    // Per-beat column occupancy
    const beatCols: string[] = [];
    const occupancy: Set<number>[] = [];
    for (let b = 0; b < 4; b++) {
      const bStart = mStart + b * beatLength;
      const bEnd = bStart + beatLength;
      const notesInBeat = notesInMeasure.filter((n) => n.t >= bStart && n.t < bEnd);
      const cols = notesInBeat.map((n) => n.col).sort();
      occupancy.push(new Set(cols));
      beatCols.push(`[${cols.join(",")}]`);
    }

    // Minijack check per column
    const jackCols: number[] = [];
    for (let col = 0; col < 4; col++) {
      let streak = 0;
      for (let b = 0; b < 4; b++) {
        if (occupancy[b]!.has(col)) {
          streak++;
          if (streak >= 2) {
            jackCols.push(col);
            break;
          }
        } else {
          streak = 0;
        }
      }
    }

    const total = notesInMeasure.length;
    const colCounts = [0, 0, 0, 0];
    for (const n of notesInMeasure) colCounts[n.col]++;

    console.log(
      `  M${m + 1}: ${total} notes | cols=[${colCounts}] | beats: ${beatCols.join(" ")} | jackCols=[${jackCols}]`,
    );
  }
  console.log("");
}
