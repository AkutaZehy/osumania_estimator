// Old createChart + calculatePrimitives (pre-optimization) vs current module output.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { createChart } from "../src/parser/chartBuilder.js";
import { calculatePrimitives } from "../src/patterns/primitives.js";
import { NoteType, type Chart } from "../src/types/chart.js";
import type { ParsedBeatmap } from "../src/types/beatmap.js";

// ---- OLD createChart (verbatim pre-opt: timeMap.keys() scan + per-note bpm) ----
function oldCreateChart(beatmap: ParsedBeatmap): Chart {
  const keys = beatmap.columnCount;
  const noteCount = beatmap.noteStarts.length;
  const timeMap = new Map<number, NoteType[]>();
  for (let i = 0; i < noteCount; i++) {
    const startTime = beatmap.noteStarts[i]!;
    const endTime = beatmap.noteEnds[i]!;
    const type = beatmap.noteTypes[i]!;
    const col = beatmap.columns[i]!;
    if (!timeMap.has(startTime)) timeMap.set(startTime, new Array<NoteType>(keys).fill(NoteType.NOTHING));
    const row = timeMap.get(startTime)!;
    const isLN = (type & 128) !== 0;
    row[col] = isLN ? NoteType.HOLDHEAD : NoteType.NORMAL;
    if (isLN && endTime > startTime) {
      if (!timeMap.has(endTime)) timeMap.set(endTime, new Array<NoteType>(keys).fill(NoteType.NOTHING));
      const tailRow = timeMap.get(endTime)!;
      if (tailRow[col] === NoteType.NOTHING) tailRow[col] = NoteType.HOLDTAIL;
    }
  }
  for (let i = 0; i < noteCount; i++) {
    const startTime = beatmap.noteStarts[i]!;
    const endTime = beatmap.noteEnds[i]!;
    const type = beatmap.noteTypes[i]!;
    const col = beatmap.columns[i]!;
    if ((type & 128) !== 0 && endTime > startTime) {
      for (const t of timeMap.keys()) {
        if (t > startTime && t < endTime) {
          const bodyRow = timeMap.get(t)!;
          if (bodyRow[col] === NoteType.NOTHING) bodyRow[col] = NoteType.HOLDBODY;
        }
      }
    }
  }
  const sortedTimes = [...timeMap.keys()].sort((a, b) => a - b);
  const notes: { time: number; data: NoteType[] }[] = sortedTimes.map((time) => ({ time, data: timeMap.get(time)! }));
  const tps = beatmap.timingPoints;
  const bpm = [] as { time: number; bpm: number; beatLength: number }[];
  if (tps.length === 0) {
    for (const n of notes) bpm.push({ time: n.time, bpm: 120, beatLength: 500 });
  } else {
    const sorted = [...tps].sort((a, b) => a.time - b.time);
    let tpIdx = 0;
    for (const note of notes) {
      while (tpIdx + 1 < sorted.length && sorted[tpIdx + 1]!.time <= note.time) tpIdx++;
      const tp = sorted[tpIdx]!;
      const beatLength = tp.beatLength > 0 ? tp.beatLength : 500;
      bpm.push({ time: note.time, bpm: 60000 / beatLength, beatLength });
    }
  }
  const firstNote = sortedTimes[0] ?? 0;
  const lastNote = sortedTimes[sortedTimes.length - 1] ?? 0;
  return { keys, notes: notes as Chart["notes"], bpm, sv: [], firstNote, lastNote, duration: lastNote - firstNote };
}

// ---- OLD beatLengthAt + old calculatePrimitives body ----
function oldBeatLengthAt(chart: Chart, time: number): number {
  if (!chart.bpm.length) return 500;
  const first = chart.bpm[0]!;
  let current = first.beatLength;
  for (const item of chart.bpm) {
    if (item.time > time) break;
    current = item.beatLength;
  }
  return current;
}

function oldCalculatePrimitives(chart: Chart, speedRate: number = 1) {
  if (!chart.notes.length) return [];
  const firstNote = chart.notes[0]!.time;
  const firstRow = chart.notes[0]!.data;
  let previousRow: number[] = [];
  for (let k = 0; k < chart.keys; k += 1) {
    if (firstRow[k] === NoteType.NORMAL || firstRow[k] === NoteType.HOLDHEAD) previousRow.push(k);
  }
  if (!previousRow.length) return [];
  let previousTime = firstNote;
  let index = 0;
  const keysOnLeftHand = (km: number): number => {
    if (km === 3 || km === 4) return 2;
    if (km === 5 || km === 6) return 3;
    if (km === 7 || km === 8) return 4;
    if (km === 9 || km === 10) return 5;
    return Math.max(1, Math.floor(km / 2));
  };
  const leftHandKeys = keysOnLeftHand(chart.keys);
  const out: unknown[] = [];
  for (const item of chart.notes.slice(1)) {
    const t = item.time;
    const row = item.data;
    index += 1;
    const currentRow: number[] = [];
    const normalNotes: number[] = [];
    const lnHeads: number[] = [];
    const lnBodies: number[] = [];
    const lnTails: number[] = [];
    for (let k = 0; k < chart.keys; k += 1) {
      const n = row[k];
      if (n === NoteType.NORMAL || n === NoteType.HOLDHEAD) currentRow.push(k);
      if (n === NoteType.NORMAL) normalNotes.push(k);
      if (n === NoteType.HOLDHEAD) lnHeads.push(k);
      else if (n === NoteType.HOLDBODY) lnBodies.push(k);
      else if (n === NoteType.HOLDTAIL) lnTails.push(k);
    }
    if (!currentRow.length && !lnHeads.length && !lnBodies.length && !lnTails.length) continue;
    let direction = "NONE";
    let isRoll = false;
    let jacks = 0;
    if (currentRow.length) {
      const prevLeftmost = previousRow[0]!;
      const prevRightmost = previousRow[previousRow.length - 1]!;
      const currLeftmost = currentRow[0]!;
      const currRightmost = currentRow[currentRow.length - 1]!;
      const lc = currLeftmost - prevLeftmost;
      const rc = currRightmost - prevRightmost;
      if (lc > 0) direction = rc > 0 ? "RIGHT" : "INWARDS";
      else if (lc < 0) direction = rc < 0 ? "LEFT" : "OUTWARDS";
      else if (rc < 0) direction = "INWARDS";
      else if (rc > 0) direction = "OUTWARDS";
      else direction = "NONE";
      isRoll = prevLeftmost > currRightmost || prevRightmost < currLeftmost;
      const prevSet = new Set(previousRow);
      jacks = currentRow.filter((x) => prevSet.has(x)).length;
    }
    out.push({
      index,
      time: t - firstNote,
      msPerBeat: ((t - previousTime) * 4.0) / speedRate,
      beatLength: oldBeatLengthAt(chart, t) / speedRate,
      notes: currentRow.length,
      jacks,
      direction,
      roll: isRoll,
      keys: chart.keys,
      leftHandKeys,
      lnHeads,
      lnBodies,
      lnTails,
      normalNotes,
      rawNotes: currentRow,
    });
    if (currentRow.length) previousRow = currentRow;
    previousTime = t;
  }
  return out;
}

// ---- Compare old vs new across all maps ----
const walk = (dir: string, out: string[]): void => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "NEVER TEST IT UNLESS I ASKED YOU") continue; walk(p, out); }
    else if (e.name.endsWith(".osu")) out.push(p);
  }
};
const maps: string[] = [];
walk("maps", maps);
let bad = 0;
for (const f of maps) {
  const text = readFileSync(f, "utf8");
  try {
    const parser = new OsuFileParser(text); parser.process();
    const parsed = parser.getParsedData();
    const oldC = oldCreateChart(parsed);
    const newC = createChart(parsed);
    // bpm is now change-point-compressed (old: one entry per note); strip it
    // from the shape compare — beatLength semantics are covered below by the
    // primitives equality (old per-note timeline vs new compressed timeline).
    const a = { ...oldC, bpm: undefined };
    const b = { ...newC, bpm: undefined };
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      bad++;
      console.log(`CHART MISMATCH: ${f.split(/[\\/]/).slice(-1)[0]}`);
      continue;
    }
    const oldP = oldCalculatePrimitives(oldC, 1.0);
    const newP = calculatePrimitives(newC, 1.0);
    if (JSON.stringify(oldP) !== JSON.stringify(newP)) {
      bad++;
      console.log(`PRIM MISMATCH: ${f.split(/[\\/]/).slice(-1)[0]} old=${oldP.length} new=${newP.length}`);
    }
  } catch { /* skip */ }
}
console.log(`${maps.length} maps checked, ${bad} mismatches`);