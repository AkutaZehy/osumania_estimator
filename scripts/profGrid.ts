import { readFileSync } from "node:fs";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";

const f = process.argv[2]!;
const text = readFileSync(f, "utf8");
const parser = new OsuFileParser(text); parser.process();
const parsed = parser.getParsedData();
console.log(`map: ${f.split(/[\/]/).slice(-1)[0]}  notes=${parsed.noteStarts.length}`);
for (let i = 0; i < 15; i++) analyzeGrid(parsed, undefined, 1.0);
console.log("warmup done, profiling...");
for (let i = 0; i < 300; i++) analyzeGrid(parsed, undefined, 1.0);
