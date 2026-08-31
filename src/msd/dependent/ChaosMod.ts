// Port of Etterna 0.72.3 Dependent/Chaos.h

import { CalcPatternMod, neutral } from "../enums.js";
import {
  any_ms_is_close,
  any_ms_is_zero,
  clamp,
  div_high_by_low,
} from "../num.js";
import { CalcMovingWindow, max_moving_window_size } from "../window.js";

/// slightly different implementation of the old chaos mod, basically picks up
/// polyishness and tries to detect awkward transitions
/// In other words, detects chaotic timing between continuous notes.
export class ChaosMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.Chaos;
  readonly name = "ChaosMod";

  // #pragma region params

  min_mod = 0.88;
  max_mod = 1.07;
  base = -0.088;

  // #pragma endregion params and param map

  // don't allow this to be a modifiable param
  readonly window = 6;

  _u = new CalcMovingWindow<number>();
  _wot = new CalcMovingWindow<number>();

  pmod = neutral;

  // #pragma region generic functions

  full_reset(): void {
    this._u.zero();
    this._wot.zero();
    this.pmod = neutral;
  }

  // #pragma endregion

  advance_sequencing(ms_any: CalcMovingWindow<number>): void {
    // most recent value
    const a = ms_any.get_now();

    // previous value
    const b = ms_any.get_last();

    if (any_ms_is_zero(a) || any_ms_is_zero(b) || any_ms_is_close(a, b)) {
      this._u.operator(1.0);
      this._wot.operator(this._u.get_mean_of_window(this.window));
      return;
    }

    const prop = div_high_by_low(a, b);
    const mop = Math.trunc(prop);
    let flop = prop - mop;

    if (flop === 0.0) {
      flop = 1.0;
    } else if (flop >= 0.5) {
      flop = Math.abs(flop - 1.0) + 1.0;
    } else if (flop < 0.5) {
      flop += 1.0;
    }

    this._u.operator(flop);
    this._wot.operator(this._u.get_mean_of_window(this.window));
  }

  operator(total_taps: number): number {
    if (total_taps === 0) {
      return neutral;
    }

    this.pmod = this.base + this._wot.get_mean_of_window(max_moving_window_size);
    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
    return this.pmod;
  }
}
