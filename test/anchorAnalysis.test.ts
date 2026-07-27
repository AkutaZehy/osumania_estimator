// ============================================================
// Anchor Analysis — Test with ALL .osu maps (v4)
// ============================================================
// Run: npx tsx test/anchorAnalysis.test.ts
// ============================================================
// LN treated as head + tail (two notes)
// P100/P90/P50 statistics with fault tolerance for P100
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";
import type { ParsedBeatmap } from "../src/types/beatmap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPS_DIR = path.resolve(__dirname, "../maps");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBPM(beatmap: ParsedBeatmap): number {
  const uninherited = beatmap.timingPoints.find((tp) => tp.uninherited);
  if (uninherited && uninherited.beatLength > 0) {
    return Math.round(60000 / uninherited.beatLength * 100) / 100;
  }
  return 120;
}

function getNotesInRange(
  beatmap: ParsedBeatmap,
  startTime: number,
  endTime: number,
): Array<{ col: number; time: number }> {
  const notes: Array<{ col: number; time: number }> = [];
  for (let i = 0; i < beatmap.noteStarts.length; i++) {
    const noteStart = beatmap.noteStarts[i]!;
    const noteEnd = beatmap.noteEnds[i]!;
    const col = beatmap.columns[i]!;
    const isLN = (beatmap.noteTypes[i]! & 128) !== 0;
    if (noteStart >= startTime && noteStart < endTime) {
      notes.push({ col, time: noteStart });
    }
    if (isLN && noteEnd > noteStart && noteEnd >= startTime && noteEnd < endTime) {
      notes.push({ col, time: noteEnd });
    }
  }
  return notes;
}

function formatTime(ms: number): string {
  const totalMs = Math.round(ms);
  const min = Math.floor(totalMs / 60000);
  const sec = Math.floor((totalMs % 60000) / 1000);
  const msec = totalMs % 1000;
  return `${min}:${sec.toString().padStart(2, '0')}:${msec.toString().padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Anchor detection with fault tolerance
// ---------------------------------------------------------------------------

/**
 * Find segments with bridge tolerance: gap=2 bridges only if followed by
 * `countdown` consecutive notes (countdown=3 means `1 0 1 1 1` bridges).
 * gap=1 always continues. gap>=3 never bridges.
 */
function findSegmentsBridge(
  positions: number[],
  minCount: number,
  countdown: number,
): Array<{ count: number; startTime: number; endTime: number }> {
  if (positions.length < minCount) return [];

  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const allSegments: Array<{ count: number; startTime: number; endTime: number }> = [];

  let i = 0;
  while (i < sorted.length) {
    // Need anchor start: minCount consecutive
    if (i + minCount > sorted.length) break;
    let anchorOK = true;
    for (let k = 1; k < minCount; k++) {
      if (sorted[i + k] !== sorted[i] + k) { anchorOK = false; break; }
    }
    if (!anchorOK) { i++; continue; }

    // Anchor found: sorted[i] .. sorted[i+minCount-1]
    let segStart = sorted[i];
    let segEnd = sorted[i + minCount - 1];
    let segCount = minCount;
    let j = i + minCount;

    while (j < sorted.length) {
      const gap = sorted[j] - segEnd;
      if (gap === 1) {
        segCount++;
        segEnd = sorted[j];
        j++;
      } else if (gap === 2) {
        // Need `countdown` consecutive notes after gap
        if (j + countdown <= sorted.length) {
          let ok = true;
          for (let k = 0; k < countdown; k++) {
            if (sorted[j + k] !== sorted[j] + k) { ok = false; break; }
          }
          if (ok) {
            segCount += countdown;
            segEnd = sorted[j + countdown - 1];
            j += countdown;
          } else {
            break;
          }
        } else {
          break;
        }
      } else {
        break; // gap >= 3
      }
    }

    allSegments.push({ count: segCount, startTime: segStart, endTime: segEnd });
    i = j;
  }

  return allSegments;
}

/**
 * Find segments without fault tolerance (strict consecutive)
 */
function findSegmentsStrict(
  positions: number[],
  minCount: number,
): Array<{ count: number; startTime: number; endTime: number }> {
  if (positions.length === 0) return [];

  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const allSegments: Array<{ count: number; startTime: number; endTime: number }> = [];

  let segStart = sorted[0]!;
  let segEnd = sorted[0]!;
  let segCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! === sorted[i - 1]! + 1) {
      segCount++;
      segEnd = sorted[i]!;
    } else {
      if (segCount >= minCount) {
        allSegments.push({ count: segCount, startTime: segStart, endTime: segEnd });
      }
      segStart = sorted[i]!;
      segEnd = sorted[i]!;
      segCount = 1;
    }
  }
  if (segCount >= minCount) {
    allSegments.push({ count: segCount, startTime: segStart, endTime: segEnd });
  }

  return allSegments;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)]!;
}

/** 补正系数: sigmoid(0.75-3.5) + 线性尾段(3.5+)
 *  k=2, x0=1.5, 拉伸至 w(0.75)=0, w(3.5)=1
 *  尾段斜率 0.1 → w(20.5)≈2.7, w(25)≈3.15
 */
function wLen(x: number): number {
  if (x < 0.75) return 0;
  const k = 2, x0 = 1.5, tail = 3.5;
  const sig = (v: number) => 1 / (1 + Math.exp(-k * (v - x0)));
  if (x <= tail) {
    const s0 = sig(0.75), s1 = sig(tail);
    return (sig(x) - s0) / (s1 - s0);
  }
  return 1 + 0.1 * (x - tail);
}

/** 次数补正: x/(x+C)×S, C=15, S=2
 *  渐进上限 2, w(1)=0.13 w(10)=0.80 w(30)=1.33 w(60)=1.60 w(100)=1.74
 */
function wCnt(c: number): number {
  return (c / (c + 15)) * 2;
}

// ---------------------------------------------------------------------------
// Detect functions returning all segments for percentile calculation
// ---------------------------------------------------------------------------

function detectSFAll(
  notes: Array<{ col: number; time: number }>,
  beatLength: number,
  useTolerance: boolean,
  bridgeCountdown?: number,
): Array<{ count: number; startTime: number; endTime: number; col: number }> {
  const sixteenthNoteLength = beatLength / 4;
  const colNotes: Array<number[]> = Array.from({ length: 4 }, () => []);
  for (const note of notes) {
    colNotes[note.col]!.push(note.time);
  }
  for (const cn of colNotes) cn.sort((a, b) => a - b);

  const allSegments: Array<{ count: number; startTime: number; endTime: number; col: number }> = [];

  for (let col = 0; col < 4; col++) {
    const times = colNotes[col]!;
    if (times.length === 0) continue;
    const positions = times.map(t => Math.round(t / sixteenthNoteLength));
    let segments: Array<{ count: number; startTime: number; endTime: number }>;
    if (bridgeCountdown !== undefined) {
      segments = findSegmentsBridge(positions, 3, bridgeCountdown);
    } else if (useTolerance) {
      segments = findSegmentsBridge(positions, 3, 3); // old behavior fallback
    } else {
      segments = findSegmentsStrict(positions, 3);
    }
    for (const seg of segments) {
      allSegments.push({
        count: seg.count,
        startTime: seg.startTime * sixteenthNoteLength,
        endTime: (seg.endTime + 1) * sixteenthNoteLength,
        col,
      });
    }
  }

  return allSegments;
}

function detectSHAll(
  notes: Array<{ col: number; time: number }>,
  beatLength: number,
  useTolerance: boolean,
  bridgeCountdown?: number,
): Array<{ count: number; startTime: number; endTime: number; hand: string }> {
  const sixteenthNoteLength = beatLength / 4;
  const leftNotes = notes.filter(n => n.col === 0 || n.col === 1);
  const rightNotes = notes.filter(n => n.col === 2 || n.col === 3);

  function detectHand(handNotes: Array<{ col: number; time: number }>): Array<{ count: number; startTime: number; endTime: number }> {
    if (handNotes.length === 0) return [];
    const positions = handNotes.map(n => Math.round(n.time / sixteenthNoteLength));
    let segments: Array<{ count: number; startTime: number; endTime: number }>;
    if (bridgeCountdown !== undefined) {
      segments = findSegmentsBridge(positions, 3, bridgeCountdown);
    } else if (useTolerance) {
      segments = findSegmentsBridge(positions, 3, 3);
    } else {
      segments = findSegmentsStrict(positions, 3);
    }
    return segments.map(seg => ({
      count: seg.count,
      startTime: seg.startTime * sixteenthNoteLength,
      endTime: (seg.endTime + 1) * sixteenthNoteLength,
    }));
  }

  const leftSegs = detectHand(leftNotes).map(s => ({ ...s, hand: "L" }));
  const rightSegs = detectHand(rightNotes).map(s => ({ ...s, hand: "R" }));
  return [...leftSegs, ...rightSegs];
}

function detectDHAll(
  notes: Array<{ col: number; time: number }>,
  beatLength: number,
  useTolerance: boolean,
  bridgeCountdown?: number,
): Array<{ count: number; startTime: number; endTime: number; pair: string }> {
  const sixteenthNoteLength = beatLength / 4;
  const pairs: Array<[string, number, number]> = [["L", 0, 2], ["R", 1, 3], ["I", 1, 2], ["O", 0, 3]];

  const allResults: Array<{ count: number; startTime: number; endTime: number; pair: string }> = [];

  for (const [name, colA, colB] of pairs) {
    const pairNotes = notes.filter(n => n.col === colA || n.col === colB);
    if (pairNotes.length === 0) continue;
    const positions = pairNotes.map(n => Math.round(n.time / sixteenthNoteLength));
    let segments: Array<{ count: number; startTime: number; endTime: number }>;
    if (bridgeCountdown !== undefined) {
      segments = findSegmentsBridge(positions, 3, bridgeCountdown);
    } else if (useTolerance) {
      segments = findSegmentsBridge(positions, 3, 3);
    } else {
      segments = findSegmentsStrict(positions, 3);
    }
    for (const seg of segments) {
      allResults.push({
        count: seg.count,
        startTime: seg.startTime * sixteenthNoteLength,
        endTime: (seg.endTime + 1) * sixteenthNoteLength,
        pair: name,
      });
    }
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Main Analysis
// ---------------------------------------------------------------------------

function analyzeMap(file: string): void {
  const osuText = fs.readFileSync(path.join(MAPS_DIR, file), "utf-8");
  const parser = new OsuFileParser(osuText);
  parser.process();
  const beatmap = parser.getParsedData();

  const rawBPM = computeBPM(beatmap);

  let equivBPM = rawBPM;
  let isJackType = false;
  try {
    const ga = analyzeGrid(beatmap, new AbortController().signal);
    if (ga && ga.bpmKeyTypes.length > 0) {
      const topKeyType = ga.bpmKeyTypes.reduce((a, b) => a.cellCount > b.cellCount ? a : b);
      equivBPM = topKeyType.bpm;
      const kt = topKeyType.keyType.toLowerCase();
      isJackType = kt.includes("chordjack") || kt.includes("minijack") || kt.includes("longjack") || kt.includes("cj") || kt.includes("mj");
    }
  } catch (e) {}

  const baseBPM = equivBPM;
  const singleFingerBPM = isJackType ? baseBPM : baseBPM / 2;
  const singleHandBPM = isJackType ? baseBPM * 2 : baseBPM;
  const singleFingerBeatLength = 60000 / singleFingerBPM;
  const singleHandBeatLength = 60000 / singleHandBPM;

  const allNotes = getNotesInRange(beatmap, beatmap.firstNote, beatmap.lastNote);

  // SF: P100 (bridge countdown=3), P90/P50 (strict)
  const sfP100 = detectSFAll(allNotes, singleFingerBeatLength, false, 3);
  const sfP90_50 = detectSFAll(allNotes, singleFingerBeatLength, false);

  // SH: P100 (bridge countdown=4), P90/P50 (strict)
  const shP100 = detectSHAll(allNotes, singleHandBeatLength, false, 4);
  const shP90_50 = detectSHAll(allNotes, singleHandBeatLength, false);

  // DH: P100 (bridge countdown=4), P90/P50 (strict)
  const dhP100 = detectDHAll(allNotes, singleHandBeatLength, false, 4);
  const dhP90_50 = detectDHAll(allNotes, singleHandBeatLength, false);

  // ---- Compute statistics ----

  // Counts sorted descending
  const sfCountsP100 = sfP100.map(s => s.count).sort((a, b) => b - a);
  const sfCounts9050 = sfP90_50.map(s => s.count).sort((a, b) => b - a);
  const shCountsP100 = shP100.map(s => s.count).sort((a, b) => b - a);
  const shCounts9050 = shP90_50.map(s => s.count).sort((a, b) => b - a);
  const dhCountsP100 = dhP100.map(s => s.count).sort((a, b) => b - a);
  const dhCounts9050 = dhP90_50.map(s => s.count).sort((a, b) => b - a);

  // Percentile values (in 16th-note counts)
  const sfP100Val = sfCountsP100.length > 0 ? sfCountsP100[0]! : 0;
  const sfP90Val = sfCounts9050.length > 0 ? percentile(sfCounts9050, 0.1) : 0;
  const sfP50Val = sfCounts9050.length > 0 ? percentile(sfCounts9050, 0.5) : 0;

  const shP100Val = shCountsP100.length > 0 ? shCountsP100[0]! : 0;
  const shP90Val = shCounts9050.length > 0 ? percentile(shCounts9050, 0.1) : 0;
  const shP50Val = shCounts9050.length > 0 ? percentile(shCounts9050, 0.5) : 0;

  const dhP100Val = dhCountsP100.length > 0 ? dhCountsP100[0]! : 0;
  const dhP90Val = dhCounts9050.length > 0 ? percentile(dhCounts9050, 0.1) : 0;
  const dhP50Val = dhCounts9050.length > 0 ? percentile(dhCounts9050, 0.5) : 0;

  // Repeat counts (independent buckets within each detection method)
  // P100 exclusive: from TOLERANT set, segments == P100Val
  // P90 exclusive: from STRICT set, segments >= P90Val AND (no P100 for strict)
  // P50 exclusive: from STRICT set, segments >= P50Val AND < P90Val
  const sfP100maxStrict = sfCounts9050.length > 0 ? sfCounts9050[0]! : 0;  // strict max
  const shP100maxStrict = shCounts9050.length > 0 ? shCounts9050[0]! : 0;
  const dhP100maxStrict = dhCounts9050.length > 0 ? dhCounts9050[0]! : 0;

  const sfRepeatP100 = sfCountsP100.length > 0 ? sfP100.filter(s => s.count === sfP100Val).length : 0;
  const sfRepeatP90 = sfCounts9050.length > 0 ? sfP90_50.filter(s => s.count >= sfP90Val && s.count < sfP100maxStrict).length : 0;
  const sfRepeatP50 = sfCounts9050.length > 0 ? sfP90_50.filter(s => s.count >= sfP50Val && s.count < sfP90Val).length : 0;

  const shRepeatP100 = shCountsP100.length > 0 ? shP100.filter(s => s.count === shP100Val).length : 0;
  const shRepeatP90 = shCounts9050.length > 0 ? shP90_50.filter(s => s.count >= shP90Val && s.count < shP100maxStrict).length : 0;
  const shRepeatP50 = shCounts9050.length > 0 ? shP90_50.filter(s => s.count >= shP50Val && s.count < shP90Val).length : 0;

  const dhRepeatP100 = dhCountsP100.length > 0 ? dhP100.filter(s => s.count === dhP100Val).length : 0;
  const dhRepeatP90 = dhCounts9050.length > 0 ? dhP90_50.filter(s => s.count >= dhP90Val && s.count < dhP100maxStrict).length : 0;
  const dhRepeatP50 = dhCounts9050.length > 0 ? dhP90_50.filter(s => s.count >= dhP50Val && s.count < dhP90Val).length : 0;

  // P100 first occurrence details
  const sfP100Seg = sfP100.find(s => s.count === sfP100Val);
  const shP100Seg = shP100.find(s => s.count === shP100Val);
  const dhP100Seg = dhP100.find(s => s.count === dhP100Val);

  // Measures = 16th counts / 4
  const sfP100m = (sfP100Val / 4).toFixed(2);
  const sfP90m = (sfP90Val / 4).toFixed(2);
  const sfP50m = (sfP50Val / 4).toFixed(2);
  const shP100m = (shP100Val / 4).toFixed(2);
  const shP90m = (shP90Val / 4).toFixed(2);
  const shP50m = (shP50Val / 4).toFixed(2);
  const dhP100m = (dhP100Val / 4).toFixed(2);
  const dhP90m = (dhP90Val / 4).toFixed(2);
  const dhP50m = (dhP50Val / 4).toFixed(2);

  // Also compute strict P100 for comparison
  const sfP100strict = detectSFAll(allNotes, singleFingerBeatLength, false);
  const shP100strict = detectSHAll(allNotes, singleHandBeatLength, false);
  const dhP100strict = detectDHAll(allNotes, singleHandBeatLength, false);
  const sfStrictP100 = sfP100strict.map(s => s.count).sort((a, b) => b - a);
  const shStrictP100 = shP100strict.map(s => s.count).sort((a, b) => b - a);
  const dhStrictP100 = dhP100strict.map(s => s.count).sort((a, b) => b - a);
  const sfStrictM = (sfStrictP100.length > 0 ? sfStrictP100[0] : 0) / 4;
  const shStrictM = (shStrictP100.length > 0 ? shStrictP100[0] : 0) / 4;
  const dhStrictM = (dhStrictP100.length > 0 ? dhStrictP100[0] : 0) / 4;

  // 原始值 (measures), 无补正
  // 显示: P100: meas (strict: meas) / P90: meas×cnt / P50: meas×cnt
  const sfP90prod = (sfP90Val / 4 * sfRepeatP90).toFixed(2);
  const sfP50prod = (sfP50Val / 4 * sfRepeatP50).toFixed(2);
  const shP90prod = (shP90Val / 4 * shRepeatP90).toFixed(2);
  const shP50prod = (shP50Val / 4 * shRepeatP50).toFixed(2);
  const dhP90prod = (dhP90Val / 4 * dhRepeatP90).toFixed(2);
  const dhP50prod = (dhP50Val / 4 * dhRepeatP50).toFixed(2);

  // Output
  console.log(`${file}`);
  console.log(`  Raw: ${rawBPM} | Base: ${baseBPM} | ${isJackType ? 'Jack' : 'Stream'}`);
  console.log(`  SF(${singleFingerBPM}): P100=${sfP100m}m(s${sfStrictM.toFixed(2)})  P90=${sfP90m}m×${sfRepeatP90}=${sfP90prod}  P50=${sfP50m}m×${sfRepeatP50}=${sfP50prod}`);
  console.log(`  SH(${singleHandBPM}): P100=${shP100m}m(s${shStrictM.toFixed(2)})  P90=${shP90m}m×${shRepeatP90}=${shP90prod}  P50=${shP50m}m×${shRepeatP50}=${shP50prod}`);
  console.log(`  DH(${singleHandBPM}): P100=${dhP100m}m(s${dhStrictM.toFixed(2)})  P90=${dhP90m}m×${dhRepeatP90}=${dhP90prod}  P50=${dhP50m}m×${dhRepeatP50}=${dhP50prod}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main() {
  const files = fs.readdirSync(MAPS_DIR).filter((f) => f.endsWith(".osu"));

  console.log("Anchor Analysis v4 - All Maps");
  console.log("=".repeat(70));
  console.log(`Found ${files.length} maps\n`);

  for (const file of files) {
    try {
      analyzeMap(file);
    } catch (error) {
      console.error(`Error analyzing ${file}:`, error);
    }
  }

  console.log("=".repeat(70));
  console.log("Analysis complete.");
}

main();
