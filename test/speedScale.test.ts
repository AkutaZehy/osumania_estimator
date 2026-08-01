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

const STREAM_MAP = loadMap("../maps/Newbie/Lime - BEYOND (FLeVI) [RC Easy].osu");

describe("speedRate scaling of time-based fields", () => {
  it("DT: grid BPM display fields scale by speedRate, structure fields stay", () => {
    const base = analyzeBeatmap(STREAM_MAP, { speedRate: 1.0 });
    const dt = analyzeBeatmap(STREAM_MAP, { speedRate: 1.5 });

    expect(base.meta.bpm).toBeGreaterThan(0);
    expect(dt.meta.bpm).toBeCloseTo(base.meta.bpm * 1.5, 0);

    const bg = base.gridAnalysis!;
    const dg = dt.gridAnalysis!;

    expect(dg.mainKeyType.bpm).toBeCloseTo(bg.mainKeyType.bpm * 1.5, 0);
    expect(dg.bpmRange.min).toBeCloseTo(bg.bpmRange.min * 1.5, 0);
    expect(dg.bpmRange.max).toBeCloseTo(bg.bpmRange.max * 1.5, 0);

    // Structure fields are speed-invariant.
    expect(dg.cells.length).toBe(bg.cells.length);
    expect(dg.segments.length).toBe(bg.segments.length);
    expect(dg.cells[0]!.startTime).toBe(bg.cells[0]!.startTime);
    expect(dg.cells[0]!.endTime).toBe(bg.cells[0]!.endTime);
  });

  it("DT: segment effectiveBPM scales", () => {
    const base = analyzeBeatmap(STREAM_MAP, { speedRate: 1.0 });
    const dt = analyzeBeatmap(STREAM_MAP, { speedRate: 1.5 });

    const bg = base.gridAnalysis!;
    const dg = dt.gridAnalysis!;
    expect(bg.segments.length).toBeGreaterThan(0);
    for (let i = 0; i < bg.segments.length; i++) {
      const expected = bg.segments[i]!.effectiveBPM * 1.5;
      expect(Math.abs(dg.segments[i]!.effectiveBPM - expected)).toBeLessThanOrEqual(1);
    }
  });

  it("DT: equivalentBPM raw and adjusted scale by speedRate", () => {
    const base = analyzeBeatmap(STREAM_MAP, { speedRate: 1.0 });
    const dt = analyzeBeatmap(STREAM_MAP, { speedRate: 1.5 });

    expect(dt.custom.equivalentBPM.rawBPM).toBeCloseTo(base.custom.equivalentBPM.rawBPM * 1.5, 1);
    expect(dt.custom.equivalentBPM.adjustedBPM).toBeCloseTo(base.custom.equivalentBPM.adjustedBPM * 1.5, 1);
  });

  it("DT: density metrics scale by speedRate", () => {
    const base = analyzeBeatmap(STREAM_MAP, { speedRate: 1.0 });
    const dt = analyzeBeatmap(STREAM_MAP, { speedRate: 1.5 });

    const bd = base.custom.density.bothHands;
    const dd = dt.custom.density.bothHands;
    expect(dd.maxDensity).toBeCloseTo(bd.maxDensity * 1.5, 5);
    expect(dd.medianDensity).toBeCloseTo(bd.medianDensity * 1.5, 5);
  });

  it("DT: stamina durations shrink, stretchRatio stays", () => {
    const base = analyzeBeatmap(STREAM_MAP, { speedRate: 1.0 });
    const dt = analyzeBeatmap(STREAM_MAP, { speedRate: 1.5 });

    const bs = base.custom.stamina;
    const ds = dt.custom.stamina;
    expect(bs.maxDuration).toBeGreaterThan(0);
    expect(ds.maxDuration).toBeCloseTo(bs.maxDuration / 1.5, 0);
    expect(ds.maxDensity).toBe(bs.maxDensity);
    expect(ds.stretchRatio).toBeCloseTo(bs.stretchRatio, 5);
  });
});
