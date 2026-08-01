// ============================================================
// Verify the LN-rework merge fixes (A + B1/B2/B3 decisions).
// Synthetic beatmaps → assert metric/subtype/keyType outcomes.
// ============================================================

import { describe, it, expect } from "vitest";
import type { ParsedBeatmap, BeatmapNote } from "../src/types/beatmap.js";
import { analyzeSections } from "../src/custom/sectionAnalysis.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";

function makeBeatmap(
  notes: Array<{ col: number; start: number; end: number; isLN: boolean }>,
  beatLength = 500,
): ParsedBeatmap {
  const sorted: BeatmapNote[] = [...notes].sort((a, b) => a.start - b.start);
  const firstNote = sorted.length > 0 ? sorted[0]!.start : 0;
  const lastEnd = sorted.length > 0 ? Math.max(...sorted.map((n) => n.end)) : firstNote + beatLength;
  return {
    columnCount: 4,
    columns: sorted.map((n) => n.col),
    noteStarts: sorted.map((n) => n.start),
    noteEnds: sorted.map((n) => n.end),
    noteTypes: sorted.map((n) => (n.isLN ? 128 : 0)),
    od: 8,
    metadata: { title: "t", artist: "a", creator: "c", version: "v", beatmapId: 1, setId: 1 },
    timingPoints: [{ time: 0, beatLength, meter: 4, sampleSet: 0, sampleIndex: 0, volume: 100, uninherited: true, effects: 0 }],
    breaks: [],
    lnRatio: sorted.filter((n) => n.isLN).length / Math.max(1, sorted.length),
    gameMode: 3,
    firstNote,
    lastNote: lastEnd,
    duration: lastEnd - firstNote,
    notes: sorted,
  };
}

const LN = (col: number, start: number, end: number) => ({ col, start, end, isLN: true });

describe("section: inverse (A6 fancy H-T-H-T)", () => {
  it("detects genuine H-T-H-T alternation and wins over tree (A5 priority)", () => {
    // col0/col1 alternate every 200ms, LN duration 100ms (> beatLength/8 = 62.5)
    const bm = makeBeatmap([
      LN(0, 0, 100), LN(1, 100, 200), LN(0, 200, 300), LN(1, 300, 400),
      LN(0, 400, 500), LN(1, 500, 600), LN(0, 600, 700), LN(1, 700, 800),
    ]);
    const sec = analyzeSections(bm);
    const m = sec.measures[0]!;
    expect(m.category).toBe("ln");
    expect(m.lnMetrics!.inverse).toBe(100);
    // A single alternating chain covers all LNs → ouroboros=100 (path cover).
    // Ouroboros has higher priority than Inverse, so subtype flips to Ouroboros.
    expect(m.lnMetrics!.ouroboros).toBe(100);
    expect(m.lnMetrics!.tree).toBe(0);
    expect(m.lnSubtype).toBe("Ouroboros");
  });

  it("rejects random two-column bodies that the naive colBodies version would count", () => {
    const bm = makeBeatmap([
      LN(0, 0, 50), LN(0, 300, 350), LN(1, 400, 450), LN(1, 700, 750),
    ]);
    const sec = analyzeSections(bm);
    const m = sec.measures[0]!;
    // Naive colBodies: 2 cols with >=2 bodies → 50%. Fancy: no alignment → 0.
    expect(m.lnMetrics!.inverse).toBe(0);
    expect(m.lnSubtype).toBe("Density"); // tapLN = 100%
  });
});

describe("section: speedy density gate (A3)", () => {
  it("suppresses speedyWC when density < 8th-note (rowsPerBeat < 2)", () => {
    // Quarter-note alternation moving right: directional but slow
    const bm = makeBeatmap([
      LN(0, 0, 300), LN(1, 500, 800), LN(2, 1000, 1300), LN(3, 1500, 1800),
    ]);
    const sec = analyzeSections(bm);
    const m = sec.measures[0]!;
    expect(m.lnMetrics!.speedyWC).toBe(0);
    expect(m.lnSubtype).toBe("Unknown");
  });
});

describe("section: tree allConnected 100% (A4 + B2)", () => {
  it("tags a fully-connected 2-col chain as Ouroboros (path cover)", () => {
    // Single T→H chain covering all LNs → ouroboros=100 under path-cover.
    const bm = makeBeatmap([LN(0, 0, 200), LN(1, 200, 400), LN(0, 400, 600)]);
    const sec = analyzeSections(bm);
    const m = sec.measures[0]!;
    expect(m.lnMetrics!.ouroboros).toBe(100);
    expect(m.lnSubtype).toBe("Ouroboros");
  });

  it("rejects 75% connectivity that the old 0.75 threshold would accept", () => {
    // 3 LNs chained + 1 orphan = 75% connected → allConnected requires 100%
    const bm = makeBeatmap([
      LN(0, 0, 200), LN(1, 200, 400), LN(2, 400, 600), LN(0, 1000, 1200),
    ]);
    const sec = analyzeSections(bm);
    const m = sec.measures[0]!;
    expect(m.lnMetrics!.tree).toBe(0);
    expect(m.lnSubtype).toBe("Unknown");
  });
});

describe("section: overlay strict forward (A1)", () => {
  it("does not count same-start chord pairs as overlay", () => {
    // Two 2-LN chords (same start per chord), no cross-overlap between chords.
    // Old sweep-line counted the same-start partner → overlay 50%; strict → 0.
    const bm = makeBeatmap([
      LN(0, 0, 400), LN(1, 0, 400), LN(2, 1000, 1400), LN(3, 1000, 1400),
    ]);
    const sec = analyzeSections(bm);
    const m = sec.measures[0]!;
    expect(m.lnMetrics!.overlay).toBe(0);
    expect(m.lnSubtype).toBe("Unknown");
  });

  it("still counts genuine staggered overlaps", () => {
    // LN0[0,600] overlapped by LN1[500,1000]; LN1[500,1000] overlapped by LN2[900,1400]
    const bm = makeBeatmap([
      LN(0, 0, 600), LN(1, 500, 1000), LN(2, 900, 1400), LN(0, 1500, 2000),
    ]);
    const sec = analyzeSections(bm);
    const m = sec.measures[0]!;
    // pairs: LN0→LN1 (500<600 ✓), LN1→LN2 (900<1000 ✓) = 2 overlays
    expect(m.lnMetrics!.overlay).toBe(50);
  });
});

describe("grid: ouroboros strict (B1)", () => {
  it("fan-out (4 heads into one tail window) is NOT ouroboros under strict", () => {
    // Old edge-count: 3 edges / 4 LNs = 75% → Ouroboros.
    // Strict path-removal: after removing longest path no 4-col chain remains → 0.
    const bm = makeBeatmap([
      LN(0, 0, 100), LN(1, 105, 300), LN(2, 106, 310), LN(3, 107, 320),
    ]);
    const grid = analyzeGrid(bm)!;
    const seg = grid.segments[0]!;
    expect(seg.category).toBe("ln");
    // 75% connectivity still passes grid tree threshold (0.75, per B2 ln-rework)
    expect(seg.keyType).toBe("LN Tree");
  });
});

describe("grid: Density primary label (B3-a)", () => {
  it("classifies short-LN segment as Density (was Speedy WC before)", () => {
    const bm = makeBeatmap([
      LN(0, 0, 40), LN(1, 100, 140), LN(2, 200, 240), LN(3, 300, 340),
    ]);
    const grid = analyzeGrid(bm)!;
    const seg = grid.segments[0]!;
    expect(seg.category).toBe("ln");
    expect(seg.keyType).toBe("Density");
  });
});
