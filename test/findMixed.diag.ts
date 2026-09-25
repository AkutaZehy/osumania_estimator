import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeSections } from "../src/custom/sectionAnalysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPS_DIR = path.resolve(__dirname, "../maps");
const allFiles = fs.readdirSync(MAPS_DIR).filter(f => f.endsWith(".osu"));

for (const file of allFiles) {
  const osuText = fs.readFileSync(path.join(MAPS_DIR, file), "utf-8");
  const parser = new OsuFileParser(osuText); parser.process();
  const beatmap = parser.getParsedData();
  
  const bpm = beatmap.timingPoints.find(tp => tp.uninherited)
    ? Math.round(60000 / beatmap.timingPoints.find(tp => tp.uninherited)!.beatLength) : 0;
  
  // Check for SV changes
  const tpCount = beatmap.timingPoints.filter(tp => tp.uninherited).length;
  const lnRatio = (beatmap.lnRatio * 100).toFixed(0);
  const short = file.match(/\[(.+?)\]/)?.[1] ?? file;
  
  // Quick scan: check if it's a Mixed chart with SV and ~180BPM
  if (Math.abs(bpm - 180) <= 30 && lnRatio !== "0" && tpCount > 1) {
    console.log(`${short.padEnd(40)} BPM:${bpm} LN:${lnRatio}% SV:${tpCount}TPs Duration:${(beatmap.duration/1000).toFixed(0)}s`);
  }
}
