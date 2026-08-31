// Port of Etterna 0.72.3 Dependent/HD_PatternMods/WideRangeJJ.h

import {
  CalcPatternMod,
  col_type,
  max_rows_for_single_interval,
  neutral,
  s_init,
} from "../enums.js";
import { clamp, fastsqrt } from "../num.js";
import { CalcMovingWindow, max_moving_window_size } from "../window.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/** Hand-Dependent PatternMod detecting jump jacks but considering flammyness. */
export class WideRangeJJMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.WideRangeJJ;
  readonly name = "WideRangeJJMod";

  // params
  window_param = 3.0;
  // how many jumpjacks are required for the pmod to not be neutral
  jj_required = 30.0;

  min_mod = 0.25;
  max_mod = 1.0;
  total_scaler = 2.5;
  cur_interval_tap_scaler = 1.2;

  // ms apart for 2 taps to be considered a jumpjack (seconds here)
  ms_threshold = 0.065;

  // add this much to the pmod before sqrt when below threshold
  calming_comp = 0.05;

  // changes the direction and sharpness of the result curve
  diff_falloff_power = 6.0;

  window = 0;

  // indices
  lc = 0;
  rc = 0;

  // moving window of "problems"
  _mw_max_problems = new CalcMovingWindow<number>();
  current_problems = 0.0;
  max_interval_problems = 0.0;

  pmod = neutral;

  // timestamps of notes in columns
  _left_times: number[] = new Array(max_rows_for_single_interval).fill(s_init);
  _right_times: number[] = new Array(max_rows_for_single_interval).fill(s_init);

  full_reset(): void {
    this._mw_max_problems.zero();
    this._left_times.fill(s_init);
    this._right_times.fill(s_init);
    this.current_problems = 0.0;
    this.max_interval_problems = 0.0;
    this.lc = 0;
    this.rc = 0;

    this.pmod = neutral;
  }

  setup(): void {
    this.window = clamp(Math.trunc(this.window_param), 1, max_moving_window_size);
  }

  check(): void {
    // check times in parallel
    // any times within the window count as the jumpishjack
    let lindex = 0;
    let rindex = 0;
    let jumpJacking = false;
    let failedLeft = false;
    let failedRight = false;
    while (lindex < this.lc && rindex < this.rc) {
      const l = this._left_times[lindex]!;
      const r = this._right_times[rindex]!;
      const diff = Math.abs(l - r);

      if (diff < this.ms_threshold) {
        lindex++;
        rindex++;

        // werent previously jumpjacking, restart at 0
        if (!jumpJacking) {
          this.current_problems = 0.0;
        }

        // given time_scaler = 1
        // diff of ms_threshold gives a value of 1
        // meaning "1 jumpjack" or "1 problem"
        // but a flammy one, is worth not so much of a jumpjack
        // using std::pow for accuracy here
        const x = Math.pow(
          diff / Math.max(this.ms_threshold, 0.00001),
          this.diff_falloff_power,
        );
        const v = 1 + x / (x - 2);
        this.current_problems += v;
        if (this.current_problems > this.max_interval_problems) {
          this.max_interval_problems = this.current_problems;
        }
        jumpJacking = true;
      } else {
        // failed case
        // throw the oldest value and try again...
        if (l > r) {
          rindex++;
          if (failedRight) {
            jumpJacking = false;
          }
          failedRight = true;
        } else if (r > l) {
          lindex++;
          if (failedLeft) {
            jumpJacking = false;
          }
          failedLeft = true;
        } else {
          // this case exists to prevent infinite loops
          // it should never happen unless you put bad values in params
          lindex++;
          rindex++;

          if (failedLeft || failedRight) {
            jumpJacking = false;
          }
          failedLeft = true;
          failedRight = true;
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
      case col_type.col_left:
        this._left_times[this.lc++] = time_s;
        break;
      case col_type.col_right:
        this._right_times[this.rc++] = time_s;
        break;
      case col_type.col_ohjump:
        this._left_times[this.lc++] = time_s;
        this._right_times[this.rc++] = time_s;
        break;
      default:
        break;
    }
  }

  set_pmod(itvhi: ItvHandInfo): void {
    const taps_in_window = itvhi.get_taps_windowf(this.window) * this.cur_interval_tap_scaler;
    const problems_in_window =
      this._mw_max_problems.get_total_for_windowf(this.window) * this.total_scaler;

    // no taps or below threshold, or actionable condition
    if (taps_in_window === 0.0 || problems_in_window < this.jj_required) {
      // when below threshold, the pmod will drift back to neutral
      // ideally take less than 5 intervals to drift
      this.pmod = fastsqrt(this.pmod + clamp(this.calming_comp, 0.0, 1.0));
    } else {
      this.pmod = (taps_in_window / problems_in_window) * 0.75;
    }

    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
  }

  operator(itvhi: ItvHandInfo): number {
    this.check();
    this._mw_max_problems.operator(this.max_interval_problems);

    this.set_pmod(itvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    // reset every interval when finished
    this.current_problems = 0.0;
    this.max_interval_problems = 0.0;
    this._left_times.fill(s_init);
    this._right_times.fill(s_init);
    this.lc = 0;
    this.rc = 0;
  }
}
