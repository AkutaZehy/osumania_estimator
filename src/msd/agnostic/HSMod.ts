// Port of Etterna 0.72.3 HS.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp, fastsqrt } from "../num.js";
import { tap_size } from "./IntervalInfo.js";
import { metaItvInfo } from "./MetaIntervalInfo.js";

/// Hand-Agnostic PatternMod detecting Handstream.
/// Looks for jacks, jumptrills, and hands (3-chords)
export class HSMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.HS;
  // const std::vector<CalcPatternMod> _dbg = { HSS, HSJ };
  readonly name = "HSMod";
  readonly _tap_size = tap_size.hand;

  // #pragma region params

  min_mod = 0.6;
  max_mod = 1.1;
  mod_base = 0.4;
  prop_buffer = 1.0;

  total_prop_min = this.min_mod;
  total_prop_max = this.max_mod;

  // was ~32/7, is higher now to push up light hs (maybe overkill tho)
  total_prop_scaler = 5.571;
  total_prop_base = 0.4;

  split_hand_pool = 1.6;
  split_hand_min = 0.89;
  split_hand_max = 1.0;
  split_hand_scaler = 1.0;

  jack_pool = 1.35;
  jack_min = 0.5;
  jack_max = 1.0;
  jack_scaler = 1.0;

  decay_factor = 0.05;

  // #pragma endregion params and param map

  total_prop = 0.0;
  jumptrill_prop = 0.0;
  jack_prop = 0.0;
  last_mod = this.min_mod;
  pmod = this.min_mod;
  t_taps = 0.0;

  full_reset(): void {
    this.last_mod = this.min_mod;
  }

  decay_mod(): void {
    this.pmod = clamp(this.last_mod - this.decay_factor, this.min_mod, this.max_mod);
    this.last_mod = this.pmod;
  }

  // inline void set_dbg(std::vector<float> doot[], const int& i)
  //{
  //	doot[HSS][i] = jumptrill_prop;
  //	doot[HSJ][i] = jack_prop;
  //}

  operator(mitvi: metaItvInfo): number {
    const itvi = mitvi._itvi;

    // empty interval, don't decay mod or update last_mod
    if (itvi.total_taps === 0) {
      return neutral;
    }

    // look ma no hands
    if (itvi.taps_by_size[this._tap_size] === 0) {
      this.decay_mod();
      return this.pmod;
    }

    this.t_taps = itvi.total_taps;

    // when bark of dog into canyon scream at you
    this.total_prop =
      this.total_prop_base +
      ((itvi.taps_by_size[this._tap_size]! +
        itvi.mixed_hs_density_tap_bonus +
        this.prop_buffer) /
        (this.t_taps - this.prop_buffer)) *
        this.total_prop_scaler;
    this.total_prop = clamp(
      fastsqrt(this.total_prop),
      this.total_prop_min,
      this.total_prop_max,
    );

    // downscale jumptrills for hs as well
    this.jumptrill_prop = clamp(
      this.split_hand_pool - mitvi.not_hs / this.t_taps,
      this.split_hand_min,
      this.split_hand_max,
    );

    // downscale by jack density rather than upscale, like cj does
    this.jack_prop = clamp(
      this.jack_pool - mitvi.actual_jacks / this.t_taps,
      this.jack_min,
      this.jack_max,
    );

    this.pmod = clamp(
      this.total_prop * this.jumptrill_prop * this.jack_prop,
      this.min_mod,
      this.max_mod,
    );

    if (mitvi.dunk_it) {
      this.pmod *= 0.99;
    }

    // set last mod, we're using it to create a decaying mod that won't
    // result in extreme spikiness if files alternate between js and
    // hs/stream
    this.last_mod = this.pmod;

    return this.pmod;
  }
}
