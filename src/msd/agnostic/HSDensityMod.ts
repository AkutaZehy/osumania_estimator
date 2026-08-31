// Port of Etterna 0.72.3 HSDensity.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp, fastsqrt } from "../num.js";
import { tap_size } from "./IntervalInfo.js";
import { metaItvInfo } from "./MetaIntervalInfo.js";

/// Hand-Agnostic PatternMod describing chord density.
/// Forms a value based on counts of chords of different sizes
/// relative to the number of notes in the interval
export class HSDensityMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.HSDensity;
  readonly name = "HSDensityMod";
  readonly _tap_size = tap_size.quad;

  // #pragma region params

  min_mod = 1.0;
  max_mod = 1.0;
  base = 0.0;

  single_scaler = 2.0;
  jump_scaler = 1.2;
  hand_scaler = 0.95;
  quad_scaler = 0.95;

  // #pragma endregion params and param map

  pmod = neutral;

  operator(mitvi: metaItvInfo): number {
    const itvi = mitvi._itvi;
    if (itvi.total_taps === 0) {
      return neutral;
    }

    const t_taps = itvi.total_taps;
    const a0 = (itvi.taps_by_size[tap_size.single]! * this.single_scaler) / t_taps;
    const a1 = (itvi.taps_by_size[tap_size.jump]! * this.jump_scaler) / t_taps;
    const a2 = (itvi.taps_by_size[tap_size.hand]! * this.hand_scaler) / t_taps;
    const a3 = (itvi.taps_by_size[tap_size.quad]! * this.quad_scaler) / t_taps;

    const aaa = a0 + a1 + a2 + a3;

    this.pmod = clamp(this.base + fastsqrt(aaa), this.min_mod, this.max_mod);

    return this.pmod;
  }
}
