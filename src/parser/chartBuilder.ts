// ============================================================
// Chart Builder — converts ParsedBeatmap to Chart structure
// Based on osumania_map_analyser patterns/chart.js
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { Chart, TimeItem, BPMEntry } from "../types/chart.js";
import { NoteType } from "../types/chart.js";

/**
 * Build a Chart intermediate representation from parsed beatmap data.
 * Groups notes by time into TimeItems and resolves BPM from timing points.
 */
export function createChart(beatmap: ParsedBeatmap): Chart {
  const keys = beatmap.columnCount;
  const noteCount = beatmap.noteStarts.length;

  // Group notes by unique time points
  const timeMap = new Map<number, NoteType[]>();

  for (let i = 0; i < noteCount; i++) {
    const startTime = beatmap.noteStarts[i]!;
    const endTime = beatmap.noteEnds[i]!;
    const type = beatmap.noteTypes[i]!;
    const col = beatmap.columns[i]!;

    // Initialize row for this time if not exists
    if (!timeMap.has(startTime)) {
      timeMap.set(startTime, new Array<NoteType>(keys).fill(NoteType.NOTHING));
    }
    const row = timeMap.get(startTime)!;

    const isLN = (type & 128) !== 0;
    row[col] = isLN ? NoteType.HOLDHEAD : NoteType.NORMAL;

    // Handle LN bodies and tails at intermediate times
    // (Simple version: we mark tails only. Full body tracking is in patternOsuParser
    // but for Sunny Rework and basic pattern detection this suffices.)
    if (isLN && endTime > startTime) {
      if (!timeMap.has(endTime)) {
        timeMap.set(endTime, new Array<NoteType>(keys).fill(NoteType.NOTHING));
      }
      const tailRow = timeMap.get(endTime)!;
      if (tailRow[col] === NoteType.NOTHING) {
        tailRow[col] = NoteType.HOLDTAIL;
      }
    }
  }

  // Build sorted TimeItem array
  const sortedTimes = [...timeMap.keys()].sort((a, b) => a - b);
  const notes: TimeItem[] = sortedTimes.map((time) => ({
    time,
    data: timeMap.get(time)!,
  }));

  // Resolve BPM from timing points
  const bpm: BPMEntry[] = resolveBPM(beatmap, notes);

  // Collect first/last note times
  const firstNote = sortedTimes[0] ?? 0;
  const lastNote = sortedTimes[sortedTimes.length - 1] ?? 0;

  return {
    keys,
    notes,
    bpm,
    sv: [], // SV tracking not needed for 4K analysis
    firstNote,
    lastNote,
    duration: lastNote - firstNote,
  };
}

/**
 * Resolve effective BPM at each note time from timing points.
 */
function resolveBPM(
  beatmap: ParsedBeatmap,
  notes: TimeItem[],
): BPMEntry[] {
  const tps = beatmap.timingPoints;
  if (tps.length === 0) {
    return notes.map((n) => ({
      time: n.time,
      bpm: 120,
      beatLength: 500,
    }));
  }

  // Sort timing points by time
  const sorted = [...tps].sort((a, b) => a.time - b.time);

  const result: BPMEntry[] = [];
  let tpIdx = 0;

  for (const note of notes) {
    // Advance to the latest timing point before this note
    while (tpIdx + 1 < sorted.length && sorted[tpIdx + 1]!.time <= note.time) {
      tpIdx++;
    }
    const tp = sorted[tpIdx]!;
    const beatLength = tp.beatLength > 0 ? tp.beatLength : 500;
    result.push({
      time: note.time,
      bpm: 60000 / beatLength,
      beatLength,
    });
  }

  return result;
}
