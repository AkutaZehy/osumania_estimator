// Port of Etterna 0.72.3 Dependent/RollJS.h

import {
  col_type,
  CalcPatternMod,
  max_rows_for_single_interval,
  neutral,
  s_init,
} from "../enums.js";
import { clamp } from "../num.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

export class RollJSMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.RollJS;
  readonly name = "RollJSMod";

  // #pragma region params

  min_mod = 0.85;
  max_mod = 1.0;
  base = 0.1;
  jj_scaler = 2.0;

  // ms apart for 2 taps to be considered a jumpjack
  // 0.075 is 200 bpm 16th trills
  // 0.050 is 300 bpm
  // 0.037 is 400 bpm
  // 0.020 is 750 bpm (375 bpm 64th)
  ms_threshold = 0.0701;

  // changes the direction and sharpness of the result curve
  // as the jumpjack width is between 0 and ms_threshold
  // a higher number here makes numbers closer to ms_threshold
  // worth more -- the falloff occurs late
  diff_falloff_power = 1.0;

  required_notes_before_nerf = 6.0;

  // #pragma endregion params and param map

  // indices
  lc = 0;
  rc = 0;

  // a "problem" is a rough value of jumpjackyness
  // whereas a 1 is 1 jump and the worst possible flam is nearly 0
  // this tracks amount of "problems" in consecutive intervals
  current_problems = 0.0;

  pmod = neutral;

  // timestamps of notes in columns
  // C++: std::array<float, max_rows_for_single_interval> (value-initialized)
  _left_times: number[] = new Array(max_rows_for_single_interval).fill(0);
  _right_times: number[] = new Array(max_rows_for_single_interval).fill(0);

  // #pragma region generic functions

  full_reset(): void {
    this._left_times.fill(s_init);
    this._right_times.fill(s_init);
    this.current_problems = 0.0;
    this.lc = 0;
    this.rc = 0;

    this.pmod = neutral;
  }

  setup(): void {}

  // #pragma endregion

  check(): void {
    // check times in parallel
    // any times within the window count as the jumpishjack
    // just ... determine the degree of jumpy the jumpyjack is
    // using ms ... or something
    let lindex = 0;
    let rindex = 0;
    while (lindex < this.lc && rindex < this.rc) {
      const l = this._left_times[lindex]!;
      const r = this._right_times[rindex]!;
      const diff = Math.abs(l - r);

      if (diff <= this.ms_threshold) {
        lindex++;
        rindex++;

        // given time_scaler = 1
        // diff of ms_threshold gives a v of 1
        // meaning "1 jumpjack" or "1 problem"
        // but a flammy one, is worth not so much of a jumpjack
        // (this function at x=[0,1] begins slow and drops fast)
        // using std::pow for accuracy here
        const x = Math.pow(
          diff / Math.max(this.ms_threshold, 0.00001),
          this.diff_falloff_power,
        );
        const v = 1 + x / (x - 2);
        this.current_problems += v;
      } else {
        // failed case
        // throw the oldest value and try again...
        if (l > r) {
          rindex++;
        } else if (r > l) {
          lindex++;
        } else {
          // this case exists to prevent infinite loops
          // it should never happen unless you put bad values in
          // params
          lindex++;
          rindex++;
        }
      }
    }
  }

  advance_sequencing(ct: col_type, time_s: number): void {
    if (this.lc >= max_rows_for_single_interval || this.rc >= max_rows_for_single_interval) {
      // completely impossible condition
      // checking for sanity and safety
      return;
    }

    switch (ct) {
      case col_type.col_left: {
        this._left_times[this.lc++] = time_s;
        break;
      }
      case col_type.col_right: {
        this._right_times[this.rc++] = time_s;
        break;
      }
      case col_type.col_ohjump: {
        this._left_times[this.lc++] = time_s;
        this._right_times[this.rc++] = time_s;
        break;
      }
      default:
        break;
    }
  }

  set_pmod(itvhi: ItvHandInfo): void {
    // no taps, no jj
    if (itvhi.get_taps_nowi() === 0 || this.current_problems === 0.0) {
      this.pmod = neutral;
      return;
    }

    if (itvhi.get_taps_nowf() < this.required_notes_before_nerf) {
      this.pmod = neutral;
      return;
    }

    this.pmod = itvhi.get_taps_nowf() / (this.current_problems * 2.0 * this.jj_scaler);
    this.pmod = clamp(this.base + this.pmod, this.min_mod, this.max_mod);
  }

  operator(itvhi: ItvHandInfo): number {
    this.check();
    this.set_pmod(itvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    // reset every interval when finished
    this.current_problems = 0.0;
    this._left_times.fill(s_init);
    this._right_times.fill(s_init);
    this.lc = 0;
    this.rc = 0;
  }
}
