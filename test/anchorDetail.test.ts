// ============================================================
// Anchor Analysis — Detailed segment dump for specific maps
// ============================================================
// npx tsx test/anchorDetail.test.ts
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
// Anchor detection (same logic as main test)
// ---------------------------------------------------------------------------

function findSegmentsWithTolerancePositions(
  positions: number[],
  minCount: number,
): Array<{ count: number; segStart: number; segEnd: number }> {
  if (positions.length === 0) return [];
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const segments: Array<{ count: number; segStart: number; segEnd: number }> = [];

  let segStart = sorted[0]!;
  let segEnd = sorted[0]!;
  let segCount = 1;
  let lastWasGap = false;

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap === 1) {
      segCount++;
      segEnd = sorted[i]!;
      lastWasGap = false;
    } else if (gap === 2 && !lastWasGap) {
      segCount++;
      segEnd = sorted[i]!;
      lastWasGap = true;
    } else {
      if (segCount >= minCount) segments.push({ count: segCount, segStart, segEnd });
      segStart = sorted[i]!;
      segEnd = sorted[i]!;
      segCount = 1;
      lastWasGap = false;
    }
  }
  if (segCount >= minCount) segments.push({ count: segCount, segStart, segEnd });
  return segments;
}

// ---------------------------------------------------------------------------
// Per-column detailed analysis
// ---------------------------------------------------------------------------

function analyzeMapDetailed(file: string): void {
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
      const top = ga.bpmKeyTypes.reduce((a, b) => a.cellCount > b.cellCount ? a : b);
      equivBPM = top.bpm;
      const kt = top.keyType.toLowerCase();
      isJackType = kt.includes("chordjack") || kt.includes("minijack") || kt.includes("longjack") || kt.includes("cj") || kt.includes("mj");
    }
  } catch {}

  const baseBPM = equivBPM;
  const sfBPM = isJackType ? baseBPM : baseBPM / 2;
  const shBPM = isJackType ? baseBPM * 2 : baseBPM;
  const sfBeatLen = 60000 / sfBPM;
  const shBeatLen = 60000 / shBPM;

  const allNotes = getNotesInRange(beatmap, beatmap.firstNote, beatmap.lastNote);
  const nps = (allNotes.length / ((beatmap.lastNote - beatmap.firstNote) / 1000)).toFixed(1);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`${file}`);
  console.log(`Raw BPM: ${rawBPM} | Eq BPM: ${baseBPM} | Type: ${isJackType ? 'Jack' : 'Stream'} | Notes: ${allNotes.length} | NPS: ${nps}`);
  
  // ---- Single-finger detailed ----
  console.log(`\n── Single-Finger (${sfBPM} BPM, ${sfBeatLen.toFixed(1)}ms/beat) ──`);
  
  for (let col = 0; col < 4; col++) {
    const colNotes = allNotes.filter(n => n.col === col).map(n => n.time).sort((a, b) => a - b);
    if (colNotes.length < 3) continue;
    
    const positions = colNotes.map(t => Math.round(t / (sfBeatLen / 4)));
    const segments = findSegmentsWithTolerance(positions, 3);
    
    // Check if this column has the longest anchor
    if (segments.length === 0) continue;
    
    console.log(`  Col ${col} (${colNotes.length} notes):`);
    
    // Sort by length descending and show top segments
    const sorted = [...segments].sort((a, b) => b.count - a.count);
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
      const s = sorted[i]!;
      const notesInSeg = colNotes.filter(t => t >= s.startTime && t < s.endTime);
      const measureCount = (s.count / 4).toFixed(2);
      console.log(`    [${measureCount}x] ${s.count} notes (${formatTime(s.startTime)}-${formatTime(s.endTime)})`);
      // Show first few note timestamps to verify
      if (s.count <= 12) {
        const gapStrs = notesInSeg.slice(0, 12).map(t => formatTime(t));
        console.log(`      times: ${gapStrs.join(', ')}`);
      }
    }
  }

  // ---- Single-hand detailed ----
  console.log(`\n── Single-Hand (${shBPM} BPM, ${shBeatLen.toFixed(1)}ms/beat) ──`);
  
  for (const [hand, cols] of [["L", [0, 1]] as const, ["R", [2, 3]] as const]) {
    const handNotes = allNotes.filter(n => cols.includes(n.col)).map(n => n.time).sort((a, b) => a - b);
    if (handNotes.length < 3) continue;
    
    const positions = handNotes.map(t => Math.round(t / (shBeatLen / 4)));
    const segments = findSegmentsWithTolerance(positions, 3);
    if (segments.length === 0) continue;
    
    console.log(`  Hand ${hand} (${handNotes.length} notes):`);
    const sorted = [...segments].sort((a, b) => b.count - a.count);
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
      const s = sorted[i]!;
      const measureCount = (s.count / 4).toFixed(2);
      console.log(`    [${measureCount}x] ${s.count} notes (${formatTime(s.startTime)}-${formatTime(s.endTime)})`);
    }
  }

  // ---- Double-hand detailed ----
  console.log(`\n── Double-Hand (${shBPM} BPM) ──`);
  
  const pairs: Array<[string, number, number]> = [["L", 0, 2], ["R", 1, 3], ["I", 1, 2], ["O", 0, 3]];
  for (const [name, colA, colB] of pairs) {
    const pairNotes = allNotes.filter(n => n.col === colA || n.col === colB).map(n => n.time).sort((a, b) => a - b);
    if (pairNotes.length < 3) continue;
    const positions = pairNotes.map(t => Math.round(t / (shBeatLen / 4)));
    const segments = findSegmentsWithTolerance(positions, 3);
    if (segments.length === 0) continue;
    
    console.log(`  Pair ${name} (${colA}+${colB}, ${pairNotes.length} notes):`);
    const sorted = [...segments].sort((a, b) => b.count - a.count);
    for (let i = 0; i < Math.min(sorted.length, 5); i++) {
      const s = sorted[i]!;
      const measureCount = (s.count / 4).toFixed(2);
      console.log(`    [${measureCount}x] ${s.count} notes (${formatTime(s.startTime)}-${formatTime(s.endTime)})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const targets = process.argv[2] ? [process.argv[2]] : [
  "Camellia - Fastest Crash (inteliser) [cracked].osu",
  "Dz'Xa - Izumi 7983 (AutotelicBrown) [Insane].osu",
  "Camellia - shadows of cats (chicken Little) [Wafles' Lv.24 1.0x].osu",
  "Lime - BEYOND (FLeVI) [RC Easy].osu",
  "Various Artists - Dan ~ REFORM ~ StaminaMap Pack (DDMythical) [Elektric U-Phoria ~ 5th ~ (Marathon)].osu",
  "Various Artists - Dan ~ REFORM ~ StaminaMap Pack (yzuio) [Hymn ~ 7th ~ (Marathon)].osu",
];

console.log("Anchor Analysis — Detailed Segment Dump\n");

for (const target of targets) {
  const found = fs.readdirSync(MAPS_DIR).find(f => f.includes(target));
  if (found) {
    analyzeMapDetailed(found);
  } else {
    console.log(`\nNot found: ${target}`);
  }
}
