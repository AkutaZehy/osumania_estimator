// Port of Etterna 0.72.3 Dependent/HD_PatternMods/WideRangeBalance.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp } from "../num.js";
import { max_moving_window_size } from "../window.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/** Hand-Dependent PatternMod describing balance between fingers. */
export class WideRangeBalanceMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.WideRangeBalance;
  readonly name = "WideRangeBalanceMod";

  // params
  window_param = 2.0;

  min_mod = 0.94;
  max_mod = 1.05;
  base = 0.425;

  buffer = 1.0;
  scaler = 1.0;
  other_scaler = 4.0;

  window = 0;
  pmod = neutral;

  full_reset(): void {
    this.pmod = neutral;
  }

  setup(): void {
    // setup should be run after loading params from disk
    this.window = clamp(Math.trunc(this.window_param), 1, max_moving_window_size);
  }

  operator(itvhi: ItvHandInfo): number {
    // nothing here
    if (itvhi.get_taps_nowi() === 0) {
      return neutral;
    }

    // same number of taps on each column for this window
    if (itvhi.cols_equal_window(this.window)) {
      return this.min_mod;
    }

    this.pmod = itvhi.get_col_prop_low_by_high_window(this.window);

    this.pmod = this.base + (this.buffer + this.scaler / this.pmod) / this.other_scaler;
    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);

    return this.pmod;
  }
}
