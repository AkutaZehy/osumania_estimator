import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPS_DIR = path.resolve(__dirname, "../maps");

const file = "Toby Fox - Dan Signicial's Jack Pack (signupredir111) [Stage VI - Another Medium].osu";
const osuText = fs.readFileSync(path.join(MAPS_DIR, file), "utf-8");
const parser = new OsuFileParser(osuText);
parser.process();
const bp = parser.getParsedData();
const beatLength = bp.timingPoints.find((t) => t.beatLength > 0)?.beatLength ?? 1000;
const measureLen = beatLength * 4;
const first = bp.firstNote;

// Check M5-M25
for (let m = 4; m < 25; m++) {
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

  // Also show per-beat structure
  const beats: number[] = [];
  for (let b = 0; b < 4; b++) {
    const bStart = mStart + b * beatLength;
    const bEnd = bStart + beatLength;
    const notesInBeat = notesInMeasure.filter((n) => n.t >= bStart && n.t < bEnd);
    beats.push(notesInBeat.length);
  }

  console.log(`M${m + 1}: notes=${total} cols=[${colCounts.join(",")}] imb=${imbalance.toFixed(2)} struct=[${beats}]`);
}
