// Port of Etterna 0.72.3 Dependent/Balance.h

import { col_type, CalcPatternMod, neutral } from "../enums.js";
import { clamp } from "../num.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/// Hand-Dependent PatternMod describing the balance between fingers.
/// The value of the mod is lowest when both fingers are equally loaded.
/// Currently only runs off of raw tap counts in the interval
export class BalanceMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.Balance;
  readonly name = "BalanceMod";

  // #pragma region params

  min_mod = 0.95;
  max_mod = 1.05;
  mod_base = 0.325;
  buffer = 1.0;
  scaler = 1.0;
  other_scaler = 4.0;

  // #pragma endregion params and param map

  pmod = neutral;

  full_reset(): void {
    this.pmod = neutral;
  }

  operator(itvhi: ItvHandInfo): number {
    // nothing here
    if (itvhi.get_taps_nowi() === 0) {
      return neutral;
    }

    // same number of taps on each column
    if (itvhi.cols_equal_now()) {
      return this.min_mod;
    }

    // probably should NOT do this but leaving enabled for now so i can
    // verify structural changes dont change output diff
    // jack, dunno if this is worth bothering about? it would only matter
    // for tech and it may matter too much there? idk
    if (
      itvhi.get_col_taps_nowi(col_type.col_left) === 0 ||
      itvhi.get_col_taps_nowi(col_type.col_right) === 0
    ) {
      return this.max_mod;
    }

    this.pmod = itvhi.get_col_prop_low_by_high();
    this.pmod =
      this.mod_base + (this.buffer + this.scaler / this.pmod) / this.other_scaler;
    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);

    return this.pmod;
  }
}
