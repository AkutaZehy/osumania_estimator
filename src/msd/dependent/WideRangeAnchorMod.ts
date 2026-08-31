// Port of Etterna 0.72.3 Dependent/HD_PatternMods/WideRangeAnchor.h

import { CalcPatternMod, col_type, neutral } from "../enums.js";
import { clamp, diff_high_by_low } from "../num.js";
import { max_moving_window_size } from "../window.js";
import type { AnchorSequencer } from "./GenericSequencing.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/** Hand-Dependent PatternMod detecting anchors in general. */
export class WideRangeAnchorMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.WideRangeAnchor;
  readonly name = "WideRangeAnchorMod";

  // params
  window_param = 2.0;

  min_mod = 1.0;
  max_mod = 1.1;
  base = 1.0;

  diff_min = 4.0;
  diff_max = 16.0;
  scaler = 0.5;

  window = 0;
  a = 0;
  b = 0;
  diff = 0;

  // set in setup
  divisor = 0.0;
  pmod = this.min_mod;

  full_reset(): void {
    this.interval_end();
    this.pmod = neutral;
  }

  setup(): void {
    // setup should be run after loading params from disk
    this.window = clamp(Math.trunc(this.window_param), 1, max_moving_window_size);
    this.divisor = Math.trunc(this.diff_max) - Math.trunc(this.diff_min);

    // /0 lul
    if (this.divisor < 0.1) this.divisor = 0.1;
  }

  set_pmod(itvhi: ItvHandInfo, as: AnchorSequencer): void {
    void itvhi;
    this.a = as.get_max_for_window_and_col(col_type.col_left, this.window);
    this.b = as.get_max_for_window_and_col(col_type.col_right, this.window);

    this.diff = diff_high_by_low(this.a, this.b);

    // nothing here
    if (this.a === 0 && this.b === 0) {
      this.pmod = neutral;
      return;
    }

    // set max mod if either is 0
    if (this.a === 0 || this.b === 0) {
      this.pmod = this.max_mod;
      return;
    }

    // difference won't matter
    if (this.diff <= Math.trunc(this.diff_min)) {
      this.pmod = this.min_mod;
      return;
    }

    // would max anyway
    if (this.diff > Math.trunc(this.diff_max)) {
      this.pmod = this.max_mod;
      return;
    }

    this.pmod =
      this.base + this.scaler * ((this.diff - this.diff_min) / this.divisor);
    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
  }

  operator(itvhi: ItvHandInfo, as: AnchorSequencer): number {
    this.set_pmod(itvhi, as);

    this.interval_end();
    return this.pmod;
  }

  /* ok technically not necessary since we don't ever do anything before these
   * values are updated, however, supposing we do add anything like shortcut
   * case handling prior to calculating these values, better this is already
   * in place */
  interval_end(): void {
    this.diff = 0;
    this.a = 0;
    this.b = 0;
  }
}
