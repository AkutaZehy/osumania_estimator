// ============================================================
// MSD engine — enums and base structures
// Faithful TS port of Etterna 0.72.3 MinaCalc (src/Etterna/MinaCalc),
// starting from NoteDataStructures.h / MinaCalc.h / SequencingHelpers.h.
// Numeric values of the enums matter: they index per-mod / per-value
// arrays, so do not reorder.
// ============================================================

export const Skillset = {
  Overall: 0,
  Stream: 1,
  Jumpstream: 2,
  Handstream: 3,
  Stamina: 4,
  JackSpeed: 5,
  Chordjack: 6,
  Technical: 7,
} as const;
export type Skillset = (typeof Skillset)[keyof typeof Skillset];
export const NUM_SKILLSET = 8;

/**
 * Akuta extension skillsets (do not reorder the core 8 — the parity harness
 * and CalcMain's skillset loop depend on the C++ layout). These live in slots
 * 8-10 of the ss-dimensioned Calc arrays; the MSD 8 keep their exact
 * semantics, and the Akuta pass writes/chisels only the extension slots.
 */
export const AkutaSkillset = {
  /** chord-jack density: notes in chord→chord adjacent rows, per hand */
  JackChord: 8,
  /** jack 卡手度: notes in 3+ same-column jack runs, per hand */
  JackTech: 9,
  /** LN coordination: taps weighted by simultaneously-held LN columns + releases, per hand */
  LNCoordination: 10,
} as const;
export type AkutaSkillset = (typeof AkutaSkillset)[keyof typeof AkutaSkillset];
export const NUM_SKILLSET_AKUTA = 11;

/** nps-unit conversion: interval base difficulty = notes × finalscaler × this.
 *  Shared by the engine (SequencedBaseDiffCalc npsBase) and the Akuta
 *  extension skillsets (akuta.ts notesToDiff) — keep them on one constant. */
export const nps_base_multiplier = 1.6;

/** Exact numeric layout of C++ `enum CalcPatternMod` (0.72.3). */
export const CalcPatternMod = {
  Stream: 0,
  JS: 1,
  HS: 2,
  CJ: 3,
  CJDensity: 4,
  HSDensity: 5,
  CJOHAnchor: 6,
  OHJumpMod: 7,
  CJOHJump: 8,
  Balance: 9,
  Roll: 10,
  RollJS: 11,
  OHTrill: 12,
  VOHTrill: 13,
  Chaos: 14,
  FlamJam: 15,
  WideRangeRoll: 16,
  WideRangeJumptrill: 17,
  WideRangeJJ: 18,
  WideRangeBalance: 19,
  WideRangeAnchor: 20,
  TheThing: 21,
  TheThing2: 22,
  RanMan: 23,
  Minijack: 24,
  TotalPatternMod: 25,
} as const;
export type CalcPatternMod = (typeof CalcPatternMod)[keyof typeof CalcPatternMod];
export const NUM_CALC_PATTERN_MOD = 26;

/** Exact numeric layout of C++ `enum CalcDiffValue` (0.72.3). */
export const CalcDiffValue = {
  NPSBase: 0,
  MSBase: 1,
  JackBase: 2,
  CJBase: 3,
  TechBase: 4,
  RMABase: 5,
  MSD: 6,
} as const;
export type CalcDiffValue = (typeof CalcDiffValue)[keyof typeof CalcDiffValue];
export const NUM_CALC_DIFF_VALUE = 7;

export const hands = { left_hand: 0, right_hand: 1 } as const;
export type hands = (typeof hands)[keyof typeof hands];
export const num_hands = 2;
export const both_hands: readonly hands[] = [hands.left_hand, hands.right_hand];

/** Exact numeric layout of C++ `enum col_type` (HD_BasicSequencing.h). */
export const col_type = {
  col_left: 0,
  col_right: 1,
  col_ohjump: 2,
  num_col_types: 3,
  col_empty: 4,
  col_init: 5,
} as const;
export type col_type = (typeof col_type)[keyof typeof col_type];

/** Etterna 0.72.3 note row: 4k column bitmask + row time in seconds. */
export interface NoteInfo {
  notes: number;
  rowTime: number;
}

/** Per-row precalculated info stored inside each interval (MinaCalc.h RowInfo). */
export interface RowInfo {
  /** Binary representation of the row, bit 0 = leftmost column. */
  row_notes: number;
  /** 1-4: tap, jump, hand, quad. */
  row_count: number;
  /** Notes per hand in this row. */
  hand_counts: [number, number];
  /** Rate-scaled row time in seconds. */
  row_time: number;
}

// ---- constants shared by the whole engine (MinaCalc.h / MinaCalcHelpers.h) ----
export const max_rating = 100.0;
export const min_rating = 0.0;
export const default_score_goal = 0.93;
export const low_acc_cutoff = 0.9;
export const ssr_goal_cap = 0.965;

/** Each interval is one half second (MinaCalc.h). */
export const default_interval_count = 1000;
export const max_intervals = 100000;
export const max_rows_for_single_interval = 50;

/** SequencingHelpers.h */
export const col_ids = [1, 2, 4, 8] as const;
export const s_init = -5.0;
export const ms_init = 5000.0;
export const finalscaler = 3.632 * 1.06;
export const any_ms_epsilon = 0.1;

/** UlbuAcolytes.h */
export const interval_span = 0.5;
export const hand_col_ids: readonly [number, number] = [3, 12];
export const neutral = 1.0;

export const agnostic_mods: readonly CalcPatternMod[] = [
  CalcPatternMod.Stream,
  CalcPatternMod.JS,
  CalcPatternMod.HS,
  CalcPatternMod.CJ,
  CalcPatternMod.CJDensity,
  CalcPatternMod.HSDensity,
  CalcPatternMod.FlamJam,
  CalcPatternMod.TheThing,
  CalcPatternMod.TheThing2,
];

export const dependent_mods: readonly CalcPatternMod[] = [
  CalcPatternMod.OHJumpMod,
  CalcPatternMod.Balance,
  CalcPatternMod.Roll,
  CalcPatternMod.RollJS,
  CalcPatternMod.OHTrill,
  CalcPatternMod.VOHTrill,
  CalcPatternMod.Chaos,
  CalcPatternMod.WideRangeBalance,
  CalcPatternMod.WideRangeRoll,
  CalcPatternMod.WideRangeJumptrill,
  CalcPatternMod.WideRangeJJ,
  CalcPatternMod.WideRangeAnchor,
  CalcPatternMod.RanMan,
  CalcPatternMod.Minijack,
  CalcPatternMod.CJOHJump,
];
