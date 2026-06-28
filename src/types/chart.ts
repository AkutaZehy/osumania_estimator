// ============================================================
// Chart Types — intermediate representation for pattern & algorithm analysis
// Based on osumania_map_analyser patterns/chart.js
// ============================================================

/**
 * Note type at a specific column in a time row.
 * Mirrors the reference's NoteType enum exactly.
 */
export const enum NoteType {
  NOTHING = 0,
  NORMAL = 1,
  HOLDHEAD = 2,
  HOLDBODY = 3,
  HOLDTAIL = 4,
}

/** A single time row: at a given time, what's happening on each column */
export interface TimeItem {
  time: number;         // ms
  data: NoteType[];     // per-column note type; length = keys
}

/** A BPM entry at a specific time (resolved from timing points) */
export interface BPMEntry {
  time: number;         // ms
  bpm: number;          // effective BPM (60000 / beatLength)
  beatLength: number;   // ms per beat
}

/** An SV (scroll velocity) change event */
export interface SVEntry {
  time: number;       // ms
  multiplier: number;   // SV multiplier (1.0 = normal)
}

/**
 * Chart is the standard intermediate representation.
 * Passed to pattern detectors, Sunny Rework, and custom metrics.
 */
export interface Chart {
  keys: number;          // key count (4 for 4K)
  notes: TimeItem[];     // one entry per unique time point with notes
  bpm: BPMEntry[];       // resolved BPM timeline
  sv: SVEntry[];         // scroll velocity timeline
  firstNote: number;     // ms
  lastNote: number;      // ms
  duration: number;      // ms
}
