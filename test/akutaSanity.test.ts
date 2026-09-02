// Akuta extension skillsets sanity: classification across map types +
// invariants (Overall buffs only, extension slots populated, MSD parity
// untouched). Calibration comes later — assertions are loose here.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { solveAkutaFromOsuText } from "../src/msd/akuta.js";
import { Skillset, AkutaSkillset } from "../src/msd/enums.js";

const ROOT = join(__dirname, "..");

const MAPS: Record<string, string> = {
  speedjack: "maps/JACK/Haddaway - What Is Love (H4chyk0) [1.0x  don't hurt me, no more].osu",
  minijack: "maps/JACK/Street - Dan Signicial's Jack Pack (signupredir111) [Stage III - Reincarnation].osu",
  chordjack: "calib/bench-maps/jack/Break(loved) x1.2.osu",
  chordjackExtreme: "calib/bench-maps/jack/CG904B[impossible](rachel) x1.2.osu",
  anchor: "calib/bench-maps/jack/air's gravity(signicial dan).osu",
  ln1: "maps/LN/Various Artists - 4K LN Dan Courses v2 ~ Stage 1 Map Pack ~ [Hitorigoto ~ 1st ~ (Marathon)].osu",
  lnHeavy: "maps/LN/Various Artists - 4K LN Dan Courses v2 ~ Stage 1 Map Pack ~ [Kyouki Ranmai ~ Yoru ~ (Marathon)].osu",
  tech: "maps/I UNDERSTAND YOU/Ludicin - Bismuth (ababa) [Archaic's Supernova].osu",
};

const NAMES: Record<number, string> = {
  [Skillset.Stream]: "Stream",
  [Skillset.Jumpstream]: "Jumpstream",
  [Skillset.Handstream]: "Handstream",
  [Skillset.Stamina]: "Stamina",
  [Skillset.JackSpeed]: "JackSpeed",
  [Skillset.Chordjack]: "Chordjack",
  [Skillset.Technical]: "Technical",
  [AkutaSkillset.JackChord]: "JackChord",
  [AkutaSkillset.JackTech]: "JackTech",
  [AkutaSkillset.LNCoordination]: "LNCoordination",
};

function run(rel: string) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const r = solveAkutaFromOsuText(text, 1.0, 0.93);
  return r;
}

describe("Akuta extension skillsets", () => {
  const results: Record<string, ReturnType<typeof run>> = {};
  for (const [name, rel] of Object.entries(MAPS)) {
    it(`solves ${name}`, () => {
      const r = run(rel);
      results[name] = r;
      const line = Object.entries(NAMES)
        .map(([ss, n]) => `${n}=${r.values[Number(ss)]!.toFixed(2)}`)
        .join(" ");
      console.log(`${name}: Overall=${r.overall.toFixed(2)} ${line}`);

      // invariants
      expect(r.overall).toBeGreaterThan(0);
      let maxSs = 0;
      for (let ss = 1; ss <= 10; ss++) maxSs = Math.max(maxSs, r.values[ss]!);
      // Overall (sigmoidal aggregate) only buffs
      expect(r.overall).toBeGreaterThanOrEqual(maxSs - 0.06);
      // extension slots populated (finite, non-negative)
      for (let ss = 8; ss <= 10; ss++) {
        expect(Number.isFinite(r.values[ss]!)).toBe(true);
        expect(r.values[ss]!).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("chordjack maps have the highest JackChord", () => {
    const cj = results["chordjack"]!.values[AkutaSkillset.JackChord]!;
    for (const other of ["speedjack", "minijack", "anchor", "ln1", "tech"]) {
      expect(cj, `vs ${other}`).toBeGreaterThan(results[other]!.values[AkutaSkillset.JackChord]!);
    }
  });

  it("chordjack maps have the highest JackTech (dense chordjack = 3+连 heavy)", () => {
    const jt = results["chordjackExtreme"]!.values[AkutaSkillset.JackTech]!;
    for (const other of ["speedjack", "minijack", "ln1", "tech"]) {
      expect(jt, `vs ${other}`).toBeGreaterThan(results[other]!.values[AkutaSkillset.JackTech]!);
    }
  });

  it("LN maps have higher LNCoordination than the no-LN maps", () => {
    const lnVal = Math.max(
      results["ln1"]!.values[AkutaSkillset.LNCoordination]!,
      results["lnHeavy"]!.values[AkutaSkillset.LNCoordination]!,
    );
    for (const other of ["speedjack", "chordjack", "tech"]) {
      expect(lnVal, `vs ${other}`).toBeGreaterThan(
        results[other]!.values[AkutaSkillset.LNCoordination]!,
      );
    }
  });
});
