// Port of Etterna 0.72.3 Dependent/Minijack.h

import { col_type, CalcPatternMod, ms_init, neutral } from "../enums.js";
import { clamp } from "../num.js";
import { CalcMovingWindow, max_moving_window_size } from "../window.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/// Hand-Dependent PatternMod detecting minijacks.
/// Minijacks cannot lead into minijacks.
/// Minijacks are simply cases of 11 or 22.
export class MinijackMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.Minijack;
  readonly name = "MinijackMod";

  // #pragma region params

  min_mod = 1.0;
  max_mod = 1.25;
  base = 0.4;

  mj_scaler = 2.6;
  mj_buffer = 0.3;

  // #pragma endregion params and param map

  // ms times for each finger
  left_ms = new CalcMovingWindow<number>();
  right_ms = new CalcMovingWindow<number>();

  // 2.0 is equivalent to 8th -> 16th
  // aka a 16th minijack in 16th js
  // if the min of the window is
  readonly minijack_speed_increase_factor = 1.9;

  // if the ms gap after a minijack larger by this factor
  // then the ms gap for the minijack is confirmed a minijack
  readonly minijack_confirmation_factor = 1.3;

  // throw out data if this many ms pass
  readonly dont_care_threshold = 500.0;

  // 150ms is a 100 bpm 16th
  readonly slow_minijack_cutoff_ms = 149.5;

  readonly window = 3;
  minijacks = 0;
  pmod = this.min_mod;

  left_since_last_right = 0;
  right_since_last_left = 0;
  left_notes = new CalcMovingWindow<number>();
  right_notes = new CalcMovingWindow<number>();

  // tracking taps that occur on the opposite hand
  off_since_last_on = 0;
  off_hand_notes = new CalcMovingWindow<number>();

  // #pragma region generic functions

  full_reset(): void {
    this.pmod = neutral;
    this.minijacks = 0;
    this.left_ms.fill(ms_init);
    this.right_ms.fill(ms_init);
    this.left_notes.fill(0);
    this.right_notes.fill(0);
    this.off_hand_notes.fill(0);
    this.left_since_last_right = 0;
    this.right_since_last_left = 0;
    this.off_since_last_on = 0;
  }

  reset_mw_for_ct(ct: col_type): void {
    switch (ct) {
      case col_type.col_left: {
        this.left_ms.fill(ms_init);
        break;
      }
      case col_type.col_right: {
        this.right_ms.fill(ms_init);
        break;
      }
      case col_type.col_ohjump: {
        this.left_ms.fill(ms_init);
        this.right_ms.fill(ms_init);
        break;
      }
      default:
        break;
    }
  }

  // #pragma endregion

  minijack_check(
    mv: CalcMovingWindow<number>,
    mwOffTapCounts: CalcMovingWindow<number>,
  ): void {
    // make sure the window is filled out
    const max = mv.get_max_for_window(this.window);
    if (max !== ms_init) {
      let i = max_moving_window_size;
      const min = mv.get_min_for_window(this.window);
      const recent_ms = mv.at(--i);
      const last_ms = mv.at(--i);
      const last_last_ms = mv.at(--i);

      // basically we dont care if the "minijack" exists
      // if it is so slow
      if (last_ms > this.slow_minijack_cutoff_ms) {
        return;
      }

      // for a minijack to count
      // it must have a gap before it and after
      // the gap before : speedup of basically 8th -> 16th or faster
      // the gap after : slowdown of basically 16th -> 12th or slower
      if (
        last_ms === min &&
        recent_ms > last_ms * this.minijack_confirmation_factor &&
        last_last_ms > last_ms * this.minijack_speed_increase_factor
      ) {
        // require that the taps which fit the minijack speed condition
        // have no off tap between. this would make it a trill instead.
        if (mwOffTapCounts.at(max_moving_window_size - 2) === 0) {
          // nerf case:
          // require that the minijack is not part of a two hand trill
          if (this.off_hand_notes.at(max_moving_window_size - 2) === 0) {
            this.minijacks++;
          }
        }
      }
    }
  }

  advance_sequencing(ct: col_type, ms_now: number): void {
    /*
    if (ms_now > dont_care_threshold) {
        // data has become stale
        reset_mw_for_ct(ct);
        return;
    }
    */

    switch (ct) {
      case col_type.col_left: {
        // if we see a left note after having seen right notes
        // we just went through a trill
        if (this.right_since_last_left > 0 || this.left_since_last_right > 0) {
          this.right_notes.operator(this.right_since_last_left);
        }
        this.left_since_last_right++;
        this.right_since_last_left = 0;
        this.left_ms.operator(ms_now);
        this.commit_off_hand_taps();
        this.minijack_check(this.left_ms, this.right_notes);
        break;
      }
      case col_type.col_right: {
        // if we see a right note after x lefts...
        // trill happen
        if (this.left_since_last_right > 0 || this.right_since_last_left > 0) {
          this.left_notes.operator(this.left_since_last_right);
        }
        this.right_since_last_left++;
        this.left_since_last_right = 0;
        this.right_ms.operator(ms_now);
        this.commit_off_hand_taps();
        this.minijack_check(this.right_ms, this.left_notes);
        break;
      }
      case col_type.col_ohjump: {
        // jumps reset trill conditions
        // 1[12] and [12]1 considered minijacks
        this.left_notes.operator(this.left_since_last_right);
        this.right_notes.operator(this.right_since_last_left);
        this.left_since_last_right = 0;
        this.right_since_last_left = 0;
        this.left_ms.operator(ms_now);
        this.right_ms.operator(ms_now);
        this.commit_off_hand_taps();
        this.minijack_check(this.left_ms, this.right_notes);
        this.minijack_check(this.right_ms, this.left_notes);
        break;
      }
      default:
        break;
    }
  }

  advance_off_hand_sequencing(): void {
    this.off_since_last_on++;
  }

  commit_off_hand_taps(): void {
    this.off_hand_notes.operator(this.off_since_last_on);
    this.off_since_last_on = 0;
  }

  set_pmod(itvhi: ItvHandInfo): void {
    if (this.minijacks === 0 || itvhi.get_taps_nowi() === 0) {
      this.pmod = neutral;
      return;
    }

    const mj = (this.minijacks + this.mj_buffer) * this.mj_scaler;
    const taps = itvhi.get_taps_nowf() - this.mj_buffer;

    this.pmod = this.base + mj / taps;

    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
  }

  operator(itvhi: ItvHandInfo): number {
    this.set_pmod(itvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    this.minijacks = 0;
  }
}
