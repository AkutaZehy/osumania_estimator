import { describe, it, expect } from "vitest";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { computeLNMetrics } from "../src/custom/lnAnalysis.js";
import { computeCustomMetrics } from "../src/custom/customMetrics.js";
import type { ParsedBeatmap } from "../src/types/beatmap.js";

/**
 * Non-4K keymode regression: computeLNMetrics hardcoded 4 column buckets and
 * threw on any note in column >= 4, which computeCustomMetrics had no guard
 * for — analyzer then silently degraded the WHOLE custom metrics block to
 * zeros on every 5K-10K chart.
 */
function makeOsu(keys: number, objects: Array<{ col: number; type: 1 | 128; t: number; end?: number }>): string {
  const w = 512 / keys;
  const x = (col: number) => Math.floor(w * (col + 0.5));
  const lines = objects.map(o =>
    o.type === 128
      ? `${x(o.col)},192,${o.t},128,0,${o.end ?? o.t + 400}:0:0:0:0:`
      : `${x(o.col)},192,${o.t},1,0:0:0:0:0:`
  );
  return [
    "osu file format v14",
    "[General]", "Mode: 3", "",
    "[Metadata]", "Title: ln-non4k", "Artist: ln-non4k", "Creator: t", "Version: t", "",
    "[Difficulty]", `CircleSize: ${keys}`, "OverallDifficulty: 8", "",
    "[TimingPoints]", "1000,300,4,2,0,60,1,0", "",
    "[HitObjects]", ...lines, "",
  ].join("\n");
}

function parse(text: string): ParsedBeatmap {
  const parser = new OsuFileParser(text);
  parser.process();
  return parser.getParsedData();
}

function chart7k() {
  return parse(makeOsu(7, [
    ...Array.from({ length: 12 }, (_, i) => ({ col: [4, 5, 6][i % 3]!, type: 128 as const, t: 1000 + i * 150 })),
    ...Array.from({ length: 12 }, (_, i) => ({ col: i % 4, type: 1 as const, t: 1000 + i * 150 })),
  ]));
}

function chart4k() {
  return parse(makeOsu(4, [
    ...Array.from({ length: 12 }, (_, i) => ({ col: i % 4, type: 128 as const, t: 1000 + i * 150 })),
    ...Array.from({ length: 12 }, (_, i) => ({ col: i % 4, type: 1 as const, t: 1000 + i * 150 })),
  ]));
}

describe("LN metrics on non-4K keymodes", () => {
  it("4K control: LN heads and tap counts are computed", () => {
    const r = computeLNMetrics(chart4k(), {} as never, {} as never);
    expect(r.totalLN).toBe(12);
    expect(r.tapLNCount).toBe(0); // 400ms holds > beatLength/4 = 75ms
  });

  it("7K: computeLNMetrics does not throw when notes land in column >= 4", () => {
    const r = computeLNMetrics(chart7k(), {} as never, {} as never);
    expect(r.totalLN).toBe(12);
  });

  it("7K: full custom metrics survive (no silent all-zero degradation)", () => {
    const parsed = chart7k();
    const custom = computeCustomMetrics(parsed, {} as never, { clusters: [] } as never);
    // density is LN-independent; a wholesale catch-degradation would zero it
    expect(custom.density.bothHands.maxDensity).toBeGreaterThan(0);
    expect(custom.ln.totalLN).toBe(12);
  });
});
