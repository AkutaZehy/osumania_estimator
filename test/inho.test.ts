import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBeatmap } from "../src/integration/analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadMap(rel: string): string {
  return readFileSync(resolve(__dirname, rel), "utf-8");
}

const LN_MAP = loadMap("../maps/LN2/Hitori Tori - perthed again (yambabom remix) (TheToaphster) [Advanced].osu");
const STREAM_MAP = loadMap("../maps/Newbie/Lime - BEYOND (FLeVI) [RC Easy].osu");

describe("IN/HO mod wiring through analyzeBeatmap", () => {
  it("HO: lnRatio drops toward 0 (LNs converted to taps)", () => {
    const base = analyzeBeatmap(LN_MAP, { modFlags: { in: false, ho: false } });
    const ho = analyzeBeatmap(LN_MAP, { modFlags: { in: false, ho: true } });

    expect(base.meta.lnRatio).toBeGreaterThan(0.2);
    expect(ho.meta.lnRatio).toBeLessThan(0.05);
  });

  it("IN: lnRatio becomes ~1 (all taps converted to holds)", () => {
    const base = analyzeBeatmap(STREAM_MAP, { modFlags: { in: false, ho: false } });
    const inverse = analyzeBeatmap(STREAM_MAP, { modFlags: { in: true, ho: false } });

    expect(base.meta.lnRatio).toBeLessThan(0.5);
    expect(inverse.meta.lnRatio).toBeGreaterThan(0.9);
  });

  it("IN and HO both produce valid star ratings (not -1)", () => {
    const inverse = analyzeBeatmap(STREAM_MAP, { modFlags: { in: true, ho: false } });
    const ho = analyzeBeatmap(LN_MAP, { modFlags: { in: false, ho: true } });

    expect(inverse.finalStar).toBeGreaterThanOrEqual(0);
    expect(ho.finalStar).toBeGreaterThanOrEqual(0);
  });
});
