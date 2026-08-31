// Port of Etterna 0.72.3 FlamJam.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp } from "../num.js";
import { FJ_Sequencer } from "./FlamSequencing.js";

/// Hand-Agnostic PatternMod detecting continuous flams.
/// Flams are n taps which are close enough to be hit as a chord.
/// Intended to downscale patterns which take advantage of
/// flams as being misinterpreted as stream instead of something like
/// chordjacks or jumpstream.
///
/// note for improvement:
/// MAKE FLAM WIDE RANGE?
/// ^ YES DO THIS
export class FlamJamMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.FlamJam;
  readonly name = "FlamJamMod";

  // #pragma region params
  min_mod = 0.3;
  max_mod = 1.0;
  scaler = 0.001;
  base = 0.5;

  group_tol = 35.0;
  step_tol = 17.5;

  // #pragma endregion params and param map

  // sequencer
  fj = new FJ_Sequencer();
  pmod = neutral;

  setup(): void {
    this.fj.set_params(this.group_tol, this.step_tol, this.scaler);
  }

  advance_sequencing(ms_now: number, notes: number): void {
    this.fj.operator(ms_now, notes);
  }

  operator(): number {
    // no flams
    if (this.fj.mod_parts[0] === 1.0) {
      return neutral;
    }

    // if (fj.the_fifth_flammament) {
    //	return min_mod;
    // }

    // water down single flams
    this.pmod = 1.0;
    for (const mp of this.fj.mod_parts) {
      this.pmod += mp;
    }
    this.pmod /= 5.0;
    this.pmod = clamp(this.base + this.pmod, this.min_mod, this.max_mod);

    // reset flags n stuff
    this.fj.handle_interval_end();

    return this.pmod;
  }
}
