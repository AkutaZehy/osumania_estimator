// ============================================================
// Grid Analysis — timing point utilities
// ============================================================

import type { ParsedBeatmap, TimingPoint } from "../../types/beatmap.js";

/** Global BPM from the first uninherited timing point. Used only for cell grid layout. */
export function getFirstBPM(beatmap: ParsedBeatmap): number {
  const uninherited = beatmap.timingPoints.find((tp) => tp.uninherited);
  if (uninherited && uninherited.beatLength > 0) {
    return Math.round((60000 / uninherited.beatLength) * 100) / 100;
  }
  return 120;
}

export function getFirstBeatLength(beatmap: ParsedBeatmap): number {
  return 60000 / getFirstBPM(beatmap);
}

/**
 * Find the active uninherited timing point at a given timestamp.
 * SV maps have multiple timing points with different BPMs.
 */
export function getActiveTimingPoint(beatmap: ParsedBeatmap, time: number): TimingPoint | null {
  let active: TimingPoint | null = null;
  for (const tp of beatmap.timingPoints) {
    if (!tp.uninherited) continue;
    if (tp.time <= time) {
      if (!active || tp.time >= active.time) active = tp;
    }
  }
  return active;
}

/** BPM from the active timing point at `time`. */
export function getActiveBPM(beatmap: ParsedBeatmap, time: number): number {
  const tp = getActiveTimingPoint(beatmap, time);
  if (tp && tp.beatLength > 0) {
    return Math.round((60000 / tp.beatLength) * 100) / 100;
  }
  return getFirstBPM(beatmap);
}

/** Beat length from the active timing point at `time`. */
export function getActiveBeatLength(beatmap: ParsedBeatmap, time: number): number {
  return 60000 / getActiveBPM(beatmap, time);
}

export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
