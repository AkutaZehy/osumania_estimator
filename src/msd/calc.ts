// ============================================================
// MSD engine — Calc state container
// Ports of MinaCalc.h `class Calc`, UlbuAcolytes.h interval helpers,
// Smooth/MSSmooth, PatternMods registry, fast_walk_and_check_for_skip.
// ============================================================

import {
  CalcDiffValue,
  CalcPatternMod,
  NUM_CALC_DIFF_VALUE,
  NUM_CALC_PATTERN_MOD,
  NUM_SKILLSET_AKUTA,
  RowInfo,
  Skillset,
  both_hands,
  default_interval_count,
  hands,
  interval_span,
  max_intervals,
  max_rows_for_single_interval,
  num_hands,
  agnostic_mods,
  dependent_mods,
  neutral,
  type NoteInfo,
} from "./enums.js";
import { column_count, mean } from "./num.js";

export class Calc {
  /** Rows per interval (MinaCalc.h adj_ni). */
  adj_ni: RowInfo[][] = [];
  /** Number of rows in each interval. */
  itv_size: number[] = [];
  /** Points per interval per hand (notes * 2). */
  itv_points: number[][] = [
    new Array(default_interval_count).fill(0),
    new Array(default_interval_count).fill(0),
  ];
  /** Pattern mod values per hand per mod per interval (neutral = 1). */
  pmod_vals: number[][][] = [];
  /** Base difficulties per hand per type per interval. */
  init_base_diff_vals: number[][][] = [];
  /** Pattern-mod-adjusted difficulties per hand per skillset per interval. */
  base_adj_diff: number[][][] = [];
  /** Base values used by the stamina model. */
  base_diff_for_stam_mod: number[][][] = [];
  /** Stamina-adjusted difficulties (recomputed per player_skill). */
  stam_adj_diff: number[] = [];
  /** Jack difficulty entries per hand: [row_time, diff] pairs. */
  jack_diff: Array<Array<[number, number]>> = [[], []];
  /** Per-row base tech values for the interval being scanned (techyo). */
  tc_static: number[] = new Array(max_rows_for_single_interval).fill(0);
  /** Per-row base chordjack values for the interval being scanned (ceejay). */
  cj_static: number[] = new Array(max_rows_for_single_interval).fill(0);
  numitv = 0;
  MaxPoints = 0;
  grindscaler = 1.0;
  ssr = true;
  debugmode = false;

  constructor() {
    this.resize_interval_dependent_vectors(default_interval_count);
  }

  resize_interval_dependent_vectors(amt: number): void {
    if (amt < this.adj_ni.length) return;
    this.adj_ni = Array.from({ length: amt }, () => []);
    this.itv_size = new Array(amt).fill(0);
    for (const h of both_hands) {
      this.itv_points[h] = new Array(amt).fill(0);
    }
    this.pmod_vals = Array.from({ length: num_hands }, () =>
      Array.from({ length: NUM_CALC_PATTERN_MOD }, () => new Array(amt).fill(1.0)),
    );
    this.init_base_diff_vals = Array.from({ length: num_hands }, () =>
      Array.from({ length: NUM_CALC_DIFF_VALUE }, () => new Array(amt).fill(0.0)),
    );
    // ss-dimensioned arrays carry the 3 Akuta extension slots (8-10) alongside
    // the core 8; the MSD pass never touches the extension slots
    this.base_adj_diff = Array.from({ length: num_hands }, () =>
      Array.from({ length: NUM_SKILLSET_AKUTA }, () => new Array(amt).fill(0.0)),
    );
    this.base_diff_for_stam_mod = Array.from({ length: num_hands }, () =>
      Array.from({ length: NUM_SKILLSET_AKUTA }, () => new Array(amt).fill(0.0)),
    );
    this.stam_adj_diff = new Array(amt).fill(0.0);
  }
}

// ---- UlbuAcolytes.h interval helpers ----

export function time_to_itv_idx(time: number): number {
  // Offset by half a millisecond to break ties on interval boundaries.
  return Math.trunc((time + 0.0005) / interval_span);
}

export function itv_idx_to_time(idx: number): number {
  return idx * interval_span;
}

// ---- smoothing (UlbuAcolytes.h) ----

export function Smooth(input: number[], neutralVal: number, end_interval: number): void {
  let f2 = neutralVal;
  let f3 = neutralVal;
  for (let i = 0; i < end_interval; ++i) {
    const f1 = f2;
    f2 = f3;
    f3 = input[i]!;
    input[i] = (f1 + f2 + f3) / 3.0;
  }
}

export function MSSmooth(input: number[], neutralVal: number, end_interval: number): void {
  let f2 = neutralVal;
  for (let i = 0; i < end_interval; ++i) {
    const f1 = f2;
    f2 = input[i]!;
    input[i] = (f1 + f2) / 2.0;
  }
}

// ---- PatternMods registry (UlbuAcolytes.h) ----

export const PatternMods = {
  set_agnostic(pmod: CalcPatternMod, val: number, pos: number, calc: Calc): void {
    calc.pmod_vals[hands.left_hand]![pmod]![pos] = val;
  },

  set_dependent(hand: number, pmod: CalcPatternMod, val: number, pos: number, calc: Calc): void {
    calc.pmod_vals[hand]![pmod]![pos] = val;
  },

  run_agnostic_smoothing_pass(end_itv: number, calc: Calc): void {
    for (const pmod of agnostic_mods) {
      Smooth(calc.pmod_vals[hands.left_hand]![pmod]!, neutral, end_itv);
    }
  },

  run_dependent_smoothing_pass(end_itv: number, calc: Calc): void {
    for (const pmod of dependent_mods) {
      for (const h of both_hands) {
        Smooth(calc.pmod_vals[h]![pmod]!, neutral, end_itv);
      }
    }
  },

  bruh_they_the_same(end_itv: number, calc: Calc): void {
    for (const pmod of agnostic_mods) {
      for (let i = 0; i < end_itv; i++) {
        calc.pmod_vals[hands.right_hand]![pmod]![i] =
          calc.pmod_vals[hands.left_hand]![pmod]![i]!;
      }
    }
  },
};

/**
 * Port of fast_walk_and_check_for_skip (UlbuAcolytes.h): builds intervals of
 * RowInfo from NoteInfo, returns true when the file should be skipped.
 */
export function fast_walk_and_check_for_skip(
  ni: readonly NoteInfo[],
  rate: number,
  calc: Calc,
  offset = 0.0,
): boolean {
  if (ni.length === 0) return true;
  if (!Number.isFinite(ni[ni.length - 1]!.rowTime)) return true;

  calc.numitv = time_to_itv_idx((ni[ni.length - 1]!.rowTime + offset) / rate) + 1;
  if (calc.numitv >= calc.itv_size.length) {
    if (calc.numitv >= max_intervals) return true;
    calc.resize_interval_dependent_vectors(calc.numitv + 2);
  }

  for (let i = 1; i < ni.length; ++i) {
    if (ni[i - 1]!.rowTime >= ni[i]!.rowTime) return true;
  }

  let itv = 0;
  let last_itv = 0;
  let row_counter = 0;
  let scaled_time = 0.0;
  for (const ri of ni) {
    if (row_counter >= max_rows_for_single_interval) return true;
    if (ri.notes < 0 || ri.notes > 0b1111) return true;

    scaled_time = (ri.rowTime + offset) / rate;
    itv = time_to_itv_idx(scaled_time);

    if (itv > last_itv) {
      if (itv - last_itv > 1) {
        for (let j = last_itv + 1; j < itv; ++j) calc.itv_size[j] = 0;
      }
      calc.itv_size[last_itv] = row_counter;
      last_itv = itv;
      row_counter = 0;
    }

    const nri: RowInfo = {
      row_notes: ri.notes,
      row_count: column_count(ri.notes),
      row_time: scaled_time,
      hand_counts: [0, 0],
    };

    let left = 0;
    let right = 0;
    if ((ri.notes & 1) !== 0) ++left;
    if ((ri.notes & 2) !== 0) ++left;
    if ((ri.notes & 4) !== 0) ++right;
    if ((ri.notes & 8) !== 0) ++right;

    nri.hand_counts[hands.left_hand] = left;
    nri.hand_counts[hands.right_hand] = right;
    calc.adj_ni[itv]![row_counter] = nri;
    ++row_counter;
  }

  if (itv - last_itv > 1) {
    for (let j = last_itv + 1; j < itv; ++j) calc.itv_size[j] = 0;
  }
  calc.itv_size[itv] = row_counter;
  calc.numitv = itv + 1;
  return false;
}

/** Mean over a sparse list (PatternModHelpers.h mean, for arrays without holes). */
export function vec_mean(v: readonly number[]): number {
  return mean(v);
}

/** Unused enums re-exported so consumers can keep parity naming. */
export { CalcDiffValue, CalcPatternMod, Skillset };
