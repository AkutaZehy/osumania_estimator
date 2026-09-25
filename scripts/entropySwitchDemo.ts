// ============================================================
// entropySwitchDemo.ts — colEntropy vs switchFrequency on
// concrete charts: tech / HJS / SS / jack contrast / Fastest Crash
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { createChart } from "../src/parser/chartBuilder.js";
import { calculatePrimitives } from "../src/patterns/primitives.js";
import { computeDensityMetrics } from "../src/custom/density.js";
import { computeStaminaMetrics } from "../src/custom/staminaAnalysis.js";
import { computeTechMetrics } from "../src/custom/techAnalysis.js";

const CHARTS: Array<[string, string]> = [
  ["tech ", "maps/RFT/True/B/Nankumo - DRAGONLADY (Hydria) [Insane].osu"],
  ["tech ", "maps/RFT/True/B/Niko - Made Of Fire (Utiba) [Can't get a comfortable spot for my right hand].osu"],
  ["tech ", "maps/RFT/True/A/Ado - USSEEWA (Anto_) [Challenge 1.15x (205bpm) HP7 OD7].osu"],
  ["HJS  ", "maps/STREAM-HJS/Colorful Sounds Port - ETERNAL DRAIN (Wh1teh) [Black Another].osu"],
  ["HJS  ", "maps/STREAM-HJS/Cranky - Time Alter (elexire) [Stagnant].osu"],
  ["HJS  ", "maps/STREAM-HJS/Various Artists - Dan ~ REFORM ~ StaminaMap Pack (DDMythical) [Elektric U-Phoria ~ 5th ~ (Marathon)].osu"],
  ["SS   ", "maps/STREAM-SS/LV.4 - Radiation 239 ([GB]LumiereLP) [p l a y t r i l l s [cut]].osu"],
  ["SS   ", "maps/STREAM-SS/Various Artists - Dan ~ REFORM ~ SpeedMap Pack (DDMythical) [Disconnected Trance ~ 9th ~ (Marathon)].osu"],
  ["SS   ", "maps/STREAM-SS/Various Artists - 4K Regular Dan Speed Practice (finamenon) [[7th Dan] Infinite - World.execute(me);].osu"],
  ["jack ", "maps/JACK/Haddaway - What Is Love (H4chyk0) [1.2x  don't hurt me, no more].osu"],
  ["jack ", "maps/JACK/Various Artists - Dan ~ REFORM ~ JackMap Pack (DDMythical) [The Lost Dedicated ~ 10th ~ (Marathon)].osu"],
  ["jack ", "maps/JACK/Various Artists - Dan Celestial -Ascension II- (ItzScep) [II# Getty - Sonic Bass ([GB]Tyris) 1.100x].osu"],
  ["jack ", "maps/JACK/Saikoro - far in the blue sky... (1nar) [42].osu"],
  ["jack ", "maps/Refer/Various Artists - Dan ~ INFINITE ~ Jack Maps 1st Pack (Kagaku) [6th - ametsuchi [1.0x Rate]].osu"],
  ["HJS  ", "maps/STREAM-HJS/Various Artists - Dan ~ REFORM ~ StaminaMap Pack (yzuio) [Angel Of Darkness ~ 4th ~ (Marathon)].osu"],
  ["?????", "maps/I UNDERSTAND YOU/Camellia - Fastest Crash (inteliser) [cracked].osu"],
];

/** probe-only diagnostic: sequence (transition) entropy over consecutive
 *  row masks — order-sensitive, unlike the histogram colEntropy. */
function transitionEntropy(primitives: ReturnType<typeof calculatePrimitives>): number {
  const maskOf = (r: { rawNotes: number[] }): number => {
    let m = 0;
    for (const c of r.rawNotes) m |= 1 << c;
    return m;
  };
  const counts = new Map<number, number>();
  let total = 0;
  for (let i = 1; i < primitives.length; i++) {
    const t = (maskOf(primitives[i - 1]!) << 4) | maskOf(primitives[i]!);
    counts.set(t, (counts.get(t) ?? 0) + 1);
    total++;
  }
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) { const p = c / total; h -= p * Math.log2(p); }
  return h;
}

console.log("type  chart".padEnd(52), "sw".padStart(3), "dtCV".padStart(5), "Htr".padStart(5));

for (const [label, rel] of CHARTS) {
  if (!existsSync(rel)) { console.log(label, rel, "NOT FOUND"); continue; }
  const text = readFileSync(rel, "utf8");
  const parser = new OsuFileParser(text);
  parser.process();
  const parsed = parser.getParsedData();
  const primitives = calculatePrimitives(createChart(parsed), 1.0);
  const density = computeDensityMetrics(parsed, 1000, 1.0);
  const stamina = computeStaminaMetrics(parsed, density, 1.0, primitives);
  const tech = computeTechMetrics(parsed, { clusters: [], category: "Unknown", lnPercent: parsed.lnRatio * 100, modeTag: "Mix", svAmount: 0, duration: parsed.duration, importantClusters: [] }, 1.0, undefined, primitives);

  const short = rel.split(/[\\/]/).pop()!.replace(/\.osu$/, "").slice(0, 46);
  console.log(
    label, short.padEnd(50),
    String(stamina.switchFrequency).padStart(3),
    tech.dtCV.toFixed(2).padStart(5),
    transitionEntropy(primitives).toFixed(2).padStart(5),
  );
}
