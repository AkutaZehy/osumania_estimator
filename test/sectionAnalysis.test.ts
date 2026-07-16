// ============================================================
// Section Analysis — Test with synthetic beatmap data
// ============================================================
// Run: npx tsx test/sectionAnalysis.test.ts
// ============================================================

import { analyzeSections } from "../src/custom/sectionAnalysis.js";
import type { ParsedBeatmap } from "../src/types/beatmap.js";
import type { TimingPoint } from "../src/types/beatmap.js";

// ---------------------------------------------------------------------------
// Helpers to build synthetic beatmaps
// ---------------------------------------------------------------------------

function makeTimingPoint(beatLength: number): TimingPoint {
  return {
    time: 0,
    beatLength,
    meter: 4,
    sampleSet: 1,
    sampleIndex: 0,
    volume: 100,
    uninherited: true,
    effects: 0,
  };
}

/**
 * Build a minimal ParsedBeatmap from note list.
 * notes: Array of [timeMs, column, endTimeMs?]
 * If endTimeMs is provided, it's an LN.
 *
 * IMPORTANT: Use exact beat lengths (60000/bpm) for note times
 * to avoid alignment issues with the analysis grid.
 */
function buildBeatmap(
  bpm: number,
  notes: Array<[number, number, number?]>,
  opts?: { title?: string; duration?: number },
): ParsedBeatmap {
  const beatLength = 60000 / bpm;
  const noteStarts: number[] = [];
  const noteEnds: number[] = [];
  const noteTypes: number[] = [];
  const columns: number[] = [];

  for (const [time, col, endTime] of notes) {
    noteStarts.push(time);
    columns.push(col);
    if (endTime !== undefined) {
      noteEnds.push(endTime);
      noteTypes.push(128); // LN
    } else {
      noteEnds.push(time);
      noteTypes.push(1); // Normal
    }
  }

  // Sort by start time, then by column for stability
  const indices = noteStarts
    .map((_, i) => i)
    .sort((a, b) => noteStarts[a]! - noteStarts[b]! || columns[a]! - columns[b]!);
  const sortedStarts = indices.map((i) => noteStarts[i]!);
  const sortedEnds = indices.map((i) => noteEnds[i]!);
  const sortedTypes = indices.map((i) => noteTypes[i]!);
  const sortedCols = indices.map((i) => columns[i]!);

  const firstNote = sortedStarts[0] ?? 0;
  const lastNote = sortedStarts[sortedStarts.length - 1] ?? 0;
  const duration = opts?.duration ?? lastNote - firstNote + 2000;

  return {
    columnCount: 4,
    columns: sortedCols,
    noteStarts: sortedStarts,
    noteEnds: sortedEnds,
    noteTypes: sortedTypes,
    od: 8,
    metadata: {
      title: opts?.title ?? "Test Map",
      artist: "Test Artist",
      creator: "Test Creator",
      version: "Test Diff",
      beatmapId: 0,
      setId: 0,
    },
    timingPoints: [makeTimingPoint(beatLength)],
    breaks: [],
    lnRatio: sortedTypes.filter((t) => (t & 128) !== 0).length / sortedTypes.length,
    gameMode: 3,
    firstNote,
    lastNote,
    duration,
  };
}

/** Helper: generate note times aligned to exact BPM grid */
function beatTime(bpm: number, measure: number, beat: number): number {
  const bl = 60000 / bpm;
  return (measure * 4 + beat) * bl;
}

// ---------------------------------------------------------------------------
// Test 1: Single Stream (1 note per beat, alternating columns)
// ---------------------------------------------------------------------------

function testSingleStream() {
  console.log("\n=== Test 1: Single Stream (4 measures, BPM=120) ===");
  const bpm = 120;
  const notes: Array<[number, number]> = [];
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      notes.push([beatTime(bpm, m, b), b % 4]);
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Single Stream" });
  const result = analyzeSections(beatmap);

  console.log(`Duration: ${(beatmap.duration / 1000).toFixed(1)}s, Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
  }
}

// ---------------------------------------------------------------------------
// Test 2: Jump Stream (2 notes per beat on different columns)
// ---------------------------------------------------------------------------

function testJumpStream() {
  console.log("\n=== Test 2: Jump Stream (4 measures, BPM=180) ===");
  const bpm = 180;
  const notes: Array<[number, number]> = [];
  // JS pattern: [2,1,2,1] — 2 notes on beats 0,2; 1 note on beats 1,3
  // Columns spread to avoid minijacks: no column on 2 adjacent beats
  // beat0=col0+col3, beat1=col1, beat2=col0+col2, beat3=col3
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      if (b === 0) { notes.push([t, 0]); notes.push([t, 3]); }
      else if (b === 1) { notes.push([t, 1]); }
      else if (b === 2) { notes.push([t, 0]); notes.push([t, 2]); }
      else { notes.push([t, 3]); }
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Jump Stream" });
  const result = analyzeSections(beatmap);

  console.log(`Duration: ${(beatmap.duration / 1000).toFixed(1)}s, Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    for (const m of seg.measures.slice(0, 2)) {
      if (m.structure) console.log(`    M${m.index + 1} structure: [${m.structure}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 3: Hand Stream (3 notes in some beats)
// ---------------------------------------------------------------------------

function testHandStream() {
  console.log("\n=== Test 3: Hand Stream (4 measures, BPM=180) ===");
  const bpm = 180;
  const notes: Array<[number, number]> = [];
  // HS pattern: [3,1,1,1] — 3-note chord on beat 0, single notes on beats 1-3
  // Columns spread: beat0=col0+col1+col2, beat1=col3, beat2=col0, beat3=col2
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      if (b === 0) { notes.push([t, 0]); notes.push([t, 1]); notes.push([t, 2]); }
      else if (b === 1) { notes.push([t, 3]); }
      else if (b === 2) { notes.push([t, 0]); }
      else { notes.push([t, 2]); }
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Hand Stream" });
  const result = analyzeSections(beatmap);

  console.log(`Duration: ${(beatmap.duration / 1000).toFixed(1)}s, Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    for (const m of seg.measures.slice(0, 2)) {
      if (m.structure) console.log(`    M${m.index + 1} structure: [${m.structure}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 4: Chord Jack (CJ pattern: 3 notes on beat, jack on col 0)
// ---------------------------------------------------------------------------

function testChordJack() {
  console.log("\n=== Test 4: Chord Jack (4 measures, BPM=200) ===");
  const bpm = 200;
  const notes: Array<[number, number]> = [];
  // CJ pattern: [3,1,2,1] with col 0 as jack column
  const structure = [3, 1, 2, 1];
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      const count = structure[b]!;
      // col 0 always has a note (jack), other columns fill up
      notes.push([t, 0]);
      for (let n = 1; n < count; n++) {
        notes.push([t, n]);
      }
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Chord Jack" });
  const result = analyzeSections(beatmap);

  console.log(`Duration: ${(beatmap.duration / 1000).toFixed(1)}s, Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    for (const m of seg.measures.slice(0, 2)) {
      if (m.structure) console.log(`    M${m.index + 1} structure: [${m.structure}], anchors: [${m.anchors}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 5: Bulk Stream (uniform 2+ per beat)
// ---------------------------------------------------------------------------

function testBulkStream() {
  console.log("\n=== Test 5: Bulk Stream (4 measures, BPM=224) ===");
  const bpm = 224;
  const notes: Array<[number, number]> = [];
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      notes.push([t, 0]);
      notes.push([t, 1]);
      notes.push([t, 2]);
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Bulk Stream" });
  const result = analyzeSections(beatmap);

  console.log(`Duration: ${(beatmap.duration / 1000).toFixed(1)}s, Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    for (const m of seg.measures.slice(0, 2)) {
      if (m.structure) console.log(`    M${m.index + 1} structure: [${m.structure}], n: ${m.n}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 6: LN Segment (50%+ LN notes → LN category)
// ---------------------------------------------------------------------------

function testLN() {
  console.log("\n=== Test 6: LN Segment (4 measures, BPM=150) ===");
  const bpm = 150;
  const bl = 60000 / bpm;
  const notes: Array<[number, number, number]> = [];
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      // Alternate: odd beats are LNs (>50% of notes)
      if (b % 2 === 1) {
        notes.push([t, 0, t + bl * 0.8]);
        notes.push([t, 3, t + bl * 0.8]);
      } else {
        notes.push([t, 1]);
        notes.push([t, 2]);
      }
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "LN Test" });
  const result = analyzeSections(beatmap);

  console.log(`LN ratio: ${(beatmap.lnRatio * 100).toFixed(0)}%, Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    if (seg.triggeredLNTypes.length > 0) {
      for (const lt of seg.triggeredLNTypes) {
        console.log(`    → ${lt.name} = ${lt.value}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test 7: Break + Stream (sparse section in the middle)
// ---------------------------------------------------------------------------

function testBreakStream() {
  console.log("\n=== Test 7: Stream + Break + Stream (BPM=120) ===");
  const bpm = 120;
  const notes: Array<[number, number]> = [];
  // Stream section 1 (measures 0-1)
  for (let m = 0; m < 2; m++) {
    for (let b = 0; b < 4; b++) {
      notes.push([beatTime(bpm, m, b), b % 4]);
    }
  }
  // Break section (measures 2-3): very sparse
  notes.push([beatTime(bpm, 2, 0), 0]);
  notes.push([beatTime(bpm, 3, 0), 2]);
  // Stream section 2 (measures 4-5)
  for (let m = 4; m < 6; m++) {
    for (let b = 0; b < 4; b++) {
      notes.push([beatTime(bpm, m, b), b % 4]);
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Break Test" });
  const result = analyzeSections(beatmap);

  console.log(`Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
  }
}

// ---------------------------------------------------------------------------
// Test 8: Broken JS (JS with gaps)
// ---------------------------------------------------------------------------

function testBrokenJS() {
  console.log("\n=== Test 8: Broken JS (4 measures, BPM=180) ===");
  const bpm = 180;
  const notes: Array<[number, number]> = [];
  // Structure: [2,1,0,1] repeated — has gaps (0)
  const structure = [2, 1, 0, 1];
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      const count = structure[b]!;
      for (let n = 0; n < count; n++) {
        notes.push([t, n]);
      }
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Broken JS" });
  const result = analyzeSections(beatmap);

  console.log(`Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    for (const m of seg.measures.slice(0, 2)) {
      if (m.structure) console.log(`    M${m.index + 1} structure: [${m.structure}], anomalies: [${m.anomalies}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 9: Mini Jack (3+ consecutive same-column notes)
// ---------------------------------------------------------------------------

function testMiniJack() {
  console.log("\n=== Test 9: Mini Jack (4 measures, BPM=200) ===");
  const bpm = 200;
  const notes: Array<[number, number]> = [];
  // MJ pattern: [1,1,1,1] with col 0 hit on beats 0,1,2 (3 consecutive) → anchor
  // Other columns alternate: beat0=col0, beat1=col0+col2, beat2=col0, beat3=col1
  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      if (b === 0) { notes.push([t, 0]); }
      else if (b === 1) { notes.push([t, 0]); notes.push([t, 2]); }
      else if (b === 2) { notes.push([t, 0]); }
      else { notes.push([t, 1]); }
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Mini Jack" });
  const result = analyzeSections(beatmap);

  console.log(`Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    for (const m of seg.measures.slice(0, 2)) {
      if (m.structure) console.log(`    M${m.index + 1} structure: [${m.structure}], anchors: [${m.anchors}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 10: Freedom Dive style (224 BPM, 16 measures, CJ pattern)
// ---------------------------------------------------------------------------

function testFreedomDive() {
  console.log("\n=== Test 10: Freedom Dive style (224 BPM, 16 measures) ===");
  const bpm = 224;
  const notes: Array<[number, number]> = [];
  // CJ-like pattern: [3,1,2,1] with col 0 as jack
  const structure = [3, 1, 2, 1];
  for (let m = 0; m < 16; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      const count = structure[b]!;
      notes.push([t, 0]); // jack col
      for (let n = 1; n < count; n++) {
        notes.push([t, n]);
      }
    }
  }
  const beatmap = buildBeatmap(bpm, notes, { title: "Freedom Dive", duration: beatTime(bpm, 16, 0) });
  const result = analyzeSections(beatmap);

  console.log(`Duration: ${(beatmap.duration / 1000).toFixed(1)}s, Total measures: ${result.totalMeasures}`);
  console.log(`Total segments: ${result.segments.length}`);
  for (const seg of result.segments) {
    console.log(
      `  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}" | ${seg.anchorStr} | ${seg.anomalyStr}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 11: Interleaved JS (user example — no minijacks, should be JS)
// ---------------------------------------------------------------------------

function testInterleavedJS() {
  console.log("\n=== Test 11: Interleaved JS (BPM=180, 4 measures) ===");
  const bpm = 180;
  const notes: Array<[number, number]> = [];

  // Pattern (1/4 interval, 4 columns):
  // Beat 0: col0, col2
  // Beat 1: col1
  // Beat 2: col0, col2
  // Beat 3: col1, col3
  //
  // No column appears on 2 consecutive beats → no minijacks → should be JS
  const pattern: Array<[number, number][]> = [
    [[0, 0], [0, 2]],  // beat 0: 2 notes
    [[0, 1]],           // beat 1: 1 note
    [[0, 0], [0, 2]],  // beat 2: 2 notes
    [[0, 1], [0, 3]],  // beat 3: 2 notes
  ];

  for (let m = 0; m < 4; m++) {
    for (let b = 0; b < 4; b++) {
      const t = beatTime(bpm, m, b);
      for (const [_, col] of pattern[b]!) {
        notes.push([t, col]);
      }
    }
  }

  const beatmap = buildBeatmap(bpm, notes, { title: "Interleaved JS" });
  const result = analyzeSections(beatmap);

  console.log(`Duration: ${(beatmap.duration / 1000).toFixed(1)}s, Total measures: ${result.totalMeasures}`);
  for (const seg of result.segments) {
    console.log(`  [M${seg.startMeasure + 1}-M${seg.endMeasure}] ${seg.category}/${seg.subType}: "${seg.patternStr}"`);
    for (const m of seg.measures.slice(0, 2)) {
      if (m.structure) console.log(`    M${m.index + 1} structure: [${m.structure}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

console.log("Section Analysis — Test Suite");
console.log("=".repeat(60));

testSingleStream();
testJumpStream();
testHandStream();
testChordJack();
testBulkStream();
testLN();
testBreakStream();
testBrokenJS();
testMiniJack();
testFreedomDive();
testInterleavedJS();

console.log("\n" + "=".repeat(60));
console.log("All tests complete.");
