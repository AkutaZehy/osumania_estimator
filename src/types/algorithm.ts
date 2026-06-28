// ============================================================
// Algorithm Types — Sunny Rework difficulty estimation
// Ported from Star-Rating-Rebirth algorithm.py
// ============================================================

/** The six strain components at a single time point */
export interface SunnyBars {
  /** Jack/density/speed strain (same-column repetition) */
  jbar: number;
  /** Cross/coordination strain (inter-column patterns) */
  xbar: number;
  /** Pattern/physical stream strain (overall note density) */
  pbar: number;
  /** Alternation/release ease (≤1, lower = harder to alternate) */
  abar: number;
  /** Release strain (LN release difficulty) */
  rbar: number;
  /** Local note density (count within ±500ms) */
  c: number;
  /** Active column count (minimum 1) */
  ks: number;
  /** Combined difficulty value at this point */
  d: number;
}

/** Data for a single sample point on the difficulty curve */
export interface StrainPoint {
  time: number;   // ms
  value: number;  // D_all at this time
}

/** Graph data for rendering the difficulty curve */
export interface DifficultyGraph {
  times: number[];
  values: number[];
}

/** Mod flags for rate/speed adjustments */
export interface ModFlags {
  dt: boolean;  // Double Time (×1.5 speed)
  ht: boolean;  // Half Time (×0.75 speed)
  hr: boolean;  // Hard Rock (OD increase)
  ez: boolean;  // Easy (OD decrease)
  da: boolean;  // Daycore (HT audio)
  in: boolean;  // Inverse (convert LN→regular notes)
  ho: boolean;  // Hold Off (strip LN tails)
}

/** Result from Sunny Rework algorithm */
export interface SunnyResult {
  /** Estimated star rating */
  star: number;
  /** Raw numeric difficulty value */
  numericDifficulty: number;
  /** LN ratio of the beatmap */
  lnRatio: number;
  /** Column count */
  columnCount: number;
  /** Difficulty curve data for graph rendering */
  graph: DifficultyGraph;
  /** Per-point bar values (for debugging/analysis) */
  bars: SunnyBars[];
  /** Hit leniency computed from OD */
  hitLeniency: number;
}
