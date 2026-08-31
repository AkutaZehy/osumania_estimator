// ============================================================
// MSD engine — chart adapter
// Builds Etterna 0.72.3 NoteInfo rows from the repo's ParsedBeatmap.
// Semantics match the reference analyser's buildRows (js/ett/calc.js):
//   - rows are grouped by exact millisecond start time
//   - long notes contribute only their head (tails ignored)
//   - row times are seconds as float32 (matching the wasm boundary)
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { NoteInfo } from "./enums.js";

export function buildNoteInfo(parsed: ParsedBeatmap, _rate = 1.0): NoteInfo[] {
  const byTime = new Map<number, number>();
  const { columns, noteStarts } = parsed;
  const len = Math.min(columns.length, noteStarts.length);

  for (let i = 0; i < len; i++) {
    const col = columns[i]!;
    const start = Math.trunc(noteStarts[i]!);
    if (col < 0 || col > 31) continue;
    const prev = byTime.get(start) ?? 0;
    byTime.set(start, prev | (1 << col));
  }

  const times = [...byTime.keys()].sort((a, b) => a - b);
  const f32 = new Float32Array(1);
  const out: NoteInfo[] = [];
  let last = -1;
  for (const t of times) {
    // rowTime lives in float32 inside MinaCalc; round-trip to match it
    f32[0] = t / 1000;
    const sec = f32[0];
    if (sec <= last) continue; // keep rows strictly increasing after f32 rounding
    last = sec;
    out.push({ notes: byTime.get(t)!, rowTime: sec });
  }
  return out;
}
