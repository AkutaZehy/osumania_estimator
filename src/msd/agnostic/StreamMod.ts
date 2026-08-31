// Port of Etterna 0.72.3 Stream.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp, fastsqrt } from "../num.js";
import { tap_size } from "./IntervalInfo.js";
import { metaItvInfo } from "./MetaIntervalInfo.js";
import { THT_Sequencing } from "./TrillSequencing.js";

// since the calc skillset balance now operates on +- rather than
// just - and then normalization, we will use this to depress the
// stream rating for non-stream files.

/// Hand-Agnostic PatternMod detecting Stream.
/// Looks for single taps out of all taps in the interval.
/// Begins to dampen in value if too many jacks are present
export class StreamMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.Stream;
  readonly name = "StreamMod";
  readonly _tap_size = tap_size.single;

  // #pragma region params
  base = 0.0;
  min_mod = 0.6;
  max_mod = 1.0;
  prop_buffer = 1.0;
  prop_scaler = 1.41;

  jack_pool = 4.0;
  jack_comp_min = 0.5;
  jack_comp_max = 1.0;

  vibro_flag = 1.0;

  tht_scaler = 0.0;
  tht_cv_threshold = 0.5;
  tht_trill_buffer = 1.4;
  tht_trill_scaler = 1.0;
  tht_jump_buffer = 1.0;
  tht_jump_scaler = 0.5;
  tht_jump_weight = 0.0;
  tht_min_prop = 0.0;
  tht_max_prop = 1.0;

  // #pragma endregion params and param map

  prop_component = 0.0;
  jack_component = 0.0;
  pmod = this.min_mod;

  trillsequencer = new THT_Sequencing();

  setup(): void {
    this.trillsequencer.set_params(
      this.tht_cv_threshold,
      this.tht_trill_buffer,
      this.tht_trill_scaler,
      this.tht_jump_buffer,
      this.tht_jump_scaler,
      this.tht_jump_weight,
      this.tht_min_prop,
      this.tht_max_prop,
    );
  }

  advance_sequencing(ms_now: number, notes: number): void {
    this.trillsequencer.operator(ms_now, notes);
  }

  full_reset(): void {
    this.trillsequencer.reset();
  }

  operator(mitvi: metaItvInfo): number {
    const itvi = mitvi._itvi;

    // 1 tap is by definition a single tap
    if (itvi.total_taps < 2) {
      return neutral;
    }

    if (itvi.taps_by_size[this._tap_size] === 0) {
      return this.min_mod;
    }

    /* we want very light js to register as stream, something like jumps on
     * every other 4th, so 17/19 ratio should return full points, but maybe
     * we should allow for some leeway in bad interval slicing this maybe
     * doesn't need to be so severe, on the other hand, maybe it doesn'ting
     * need to be not needing'nt to be so severe */

    // we could make better use of sequencing here since now it's easy

    this.prop_component =
      ((itvi.taps_by_size[this._tap_size]! + this.prop_buffer) /
        (itvi.total_taps - this.prop_buffer)) *
      this.prop_scaler;

    // allow for a mini/triple jack in streams.. but not more than that
    this.jack_component = clamp(
      this.jack_pool - mitvi.actual_jacks,
      this.jack_comp_min,
      this.jack_comp_max,
    );
    this.pmod = fastsqrt(this.prop_component * this.jack_component);

    // water downing based on two hand trills
    const tht_prop = this.trillsequencer.get(mitvi);
    this.pmod *= 1 - tht_prop * this.tht_scaler;
    this.trillsequencer.reset();

    this.pmod = clamp(this.base + this.pmod, this.min_mod, this.max_mod);

    if (mitvi.basically_vibro) {
      if (mitvi.num_var === 1) {
        this.pmod *= 0.5 * this.vibro_flag;
      } else if (mitvi.num_var === 2) {
        this.pmod *= 0.9 * this.vibro_flag;
      } else if (mitvi.num_var === 3) {
        this.pmod *= 0.95 * this.vibro_flag;
      }
    }

    // actual mod
    return this.pmod;
  }
}
