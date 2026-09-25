import { describe, it, expect } from "vitest";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { computeAnchorMetrics } from "../src/custom/anchorAnalysis.js";
import type { ParsedBeatmap } from "../src/types/beatmap.js";
import type { GridAnalysisResult } from "../src/custom/gridAnalysis.js";

/**
 * Anchor metrics under mod speeds: gridAnalysis scales bpmKeyTypes[].bpm by
 * speedRate for display, but anchorAnalysis must bucket RAW note times against
 * the NOMINAL (unscaled) BPM. Feeding it the display-scaled BPM double-scales
 * and shreds every SF/SH/DH segment chain under DT/HT.
 */
function makeOsu(objects: Array<{ col: number; t: number }>): string {
  const lines = objects.map(o => `${o.col * 128 + 64},192,${o.t},1,0:0:0:0:0:`);
  return [
    "osu file format v14",
    "[General]", "Mode: 3", "",
    "[Metadata]", "Title: anchor-rate", "Artist: anchor-rate", "Creator: t", "Version: t", "",
    "[Difficulty]", "CircleSize: 4", "OverallDifficulty: 8", "",
    "[TimingPoints]", "1000,300,4,2,0,60,1,0", "",
    "[HitObjects]", ...lines, "",
  ].join("\n");
}

function parse(text: string): ParsedBeatmap {
  const parser = new OsuFileParser(text);
  parser.process();
  return parser.getParsedData();
}

// 30 consecutive 1/4 notes on column 0 at nominal 200 BPM (150ms @ beat 75ms)
const parsed = parse(makeOsu(Array.from({ length: 30 }, (_, i) => ({ col: 0, t: 1000 + i * 150 }))));

function gridWithBpm(bpm: number): GridAnalysisResult {
  return { bpmKeyTypes: [{ keyType: "Jumpstream", bpm, cellCount: 5, percentage: 100 }] } as GridAnalysisResult;
}

describe("anchor metrics under mod speeds", () => {
  it("DT: grid BPM pre-scaled by 1.5 with speedRate 1.5 equals the nomod result", () => {
    const nomod = computeAnchorMetrics(parsed, gridWithBpm(200), 1);
    const dt = computeAnchorMetrics(parsed, gridWithBpm(300), 1.5);
    expect(dt.sf).toEqual(nomod.sf);
    expect(dt.sh).toEqual(nomod.sh);
    expect(dt.dh).toEqual(nomod.dh);
    expect(nomod.sf.p100).toBeGreaterThan(0); // sanity: nomod actually finds anchors
  });

  it("HT: grid BPM pre-scaled by 0.75 with speedRate 0.75 equals the nomod result", () => {
    const nomod = computeAnchorMetrics(parsed, gridWithBpm(200), 1);
    const ht = computeAnchorMetrics(parsed, gridWithBpm(150), 0.75);
    expect(ht.sf).toEqual(nomod.sf);
  });
});
