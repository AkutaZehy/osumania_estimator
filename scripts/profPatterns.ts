import { readFileSync } from "node:fs";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzePatterns } from "../src/patterns/summary.js";

const f = process.argv[2]!;
const text = readFileSync(f, "utf8");
const parser = new OsuFileParser(text); parser.process();
const parsed = parser.getParsedData();
console.log(`map: ${f.split(/[\/]/).slice(-1)[0]}  notes=${parsed.noteStarts.length}`);
for (let i = 0; i < 20; i++) analyzePatterns(parsed);
console.log("warmup done, profiling...");
for (let i = 0; i < 80; i++) analyzePatterns(parsed);
