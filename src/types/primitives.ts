// ============================================================
// Primitive Types — row-level feature extraction for pattern detection
// Based on osumania_map_analyser patterns/primitives.js
// ============================================================

/**
 * Direction of column movement between consecutive rows.
 */
export const enum Direction {
  NONE = "NONE",
  LEFT = "LEFT",
  RIGHT = "RIGHT",
  OUTWARDS = "OUTWARDS",
  INWARDS = "INWARDS",
}

/**
 * A single row of extracted primitives.
 * Each primitive row corresponds to one TimeItem in the chart.
 */
export interface PrimitiveRow {
  /** Row index in the chart */
  index: number;
  /** Absolute time in ms from first note */
  time: number;
  /** Scaled time delta from previous note: Δt × 4.0 */
  msPerBeat: number;
  /** Effective beat length in ms at this time (from BPM) */
  beatLength: number;
  /** Total playable notes in this row (NORMAL + HOLDHEAD) */
  notes: number;
  /** Number of columns repeated from previous row */
  jacks: number;
  /** Column movement direction from previous row */
  direction: Direction;
  /** True if column ranges cross over between consecutive rows */
  roll: boolean;
  /** Key count */
  keys: number;
  /** Hand split point (floor(keys/2)) */
  leftHandKeys: number;
  /** Columns with HOLDHEAD */
  lnHeads: number[];
  /** Columns with HOLDBODY */
  lnBodies: number[];
  /** Columns with HOLDTAIL */
  lnTails: number[];
  /** Columns with NORMAL notes */
  normalNotes: number[];
  /** Columns with NORMAL or HOLDHEAD (playable notes) */
  rawNotes: number[];
}
