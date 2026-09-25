// ============================================================
// varianceDemo.ts — density variability of the disputed charts.
// "irregular" hypothesis: 非常技 = high CV of per-second NPS and
// of row spacing, not shape vocabulary.
// ============================================================

import { readFileSync } from "node:fs";
import { OsuFileParser } from "../src/parser/osuFileParser.js";

const CHARTS: Array<[string, string]> = [
  ["FastestCrash ", "maps/I UNDERSTAND YOU/Camellia - Fastest Crash (inteliser) [cracked].osu"],
  ["WhatIsLove   ", "maps/JACK/Haddaway - What Is Love (H4chyk0) [1.2x  don't hurt me, no more].osu"],
  ["LostDedicated", "maps/JACK/Various Artists - Dan ~ REFORM ~ JackMap Pack (DDMythical) [The Lost Dedicated ~ 10th ~ (Marathon)].osu"],
  ["[42]         ", "maps/JACK/Saikoro - far in the blue sky... (1nar) [42].osu"],
  ["DRAGONLADY   ", "maps/RFT/True/B/Nankumo - DRAGONLADY (Hydria) [Insane].osu"],
  ["Speed9th     ", "maps/STREAM-SS/Various Artists - Dan ~ REFORM ~ SpeedMap Pack (DDMythical) [Disconnected Trance ~ 9th ~ (Marathon)].osu"],
];

function cv(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return 0;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return sd / mean;
}

console.log("chart".padEnd(16), "npsCV(1s)".padStart(9), "npsCV(2s)".padStart(9), "dtCV".padStart(6));
for (const [label, rel] of CHARTS) {
  const parser = new OsuFileParser(readFileSync(rel, "utf8"));
  parser.process();
  const p = parser.getParsedData();
  const starts = p.noteStarts;
  const t0 = starts[0]!, t1 = starts[starts.length - 1]!;

  // per-second NPS series
  for (const win of [1000, 2000]) {
    void win;
  }
  const buckets1: number[] = [];
  const buckets2: number[] = [];
  for (const size of [1000, 2000]) {
    const arr: number[] = [];
    for (let t = t0; t < t1; t += size) {
      const hi = t + size;
      let c = 0;
      for (const s of starts) { if (s >= t && s < hi) c++; else if (s >= hi) break; }
      arr.push(c / (size / 1000));
    }
    (size === 1000 ? buckets1 : buckets2).push(...arr);
  }
  void buckets2;

  // row spacing CV (active rows only, dt ≤ 2000ms to ignore breaks)
  const rows: number[] = [];
  let prev = -1;
  for (const s of starts) {
    if (s === prev) continue;
    if (prev >= 0 && s - prev <= 2000) rows.push(s - prev);
    prev = s;
  }

  // recompute separately (the loop above pushed both into buckets1)
  const b1: number[] = [];
  for (let t = t0; t < t1; t += 1000) {
    const hi = t + 1000;
    let c = 0;
    for (const s of starts) { if (s >= t && s < hi) c++; else if (s >= hi) break; }
    b1.push(c);
  }
  void buckets1; void b1;

  const nps1: number[] = [];
  for (let t = t0; t < t1; t += 1000) {
    const hi = t + 1000;
    let c = 0;
    for (const s of starts) { if (s >= t && s < hi) c++; else if (s >= hi) break; }
    nps1.push(c);
  }
  const nps2: number[] = [];
  for (let t = t0; t < t1; t += 2000) {
    const hi = t + 2000;
    let c = 0;
    for (const s of starts) { if (s >= t && s < hi) c++; else if (s >= hi) break; }
    nps2.push(c / 2);
  }

  console.log(
    label.padEnd(16),
    cv(nps1.map(x => x)).toFixed(2).padStart(9),
    cv(nps2.map(x => x)).toFixed(2).padStart(9),
    cv(rows).toFixed(2).padStart(6),
  );
}
