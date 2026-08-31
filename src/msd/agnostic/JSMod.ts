// Port of Etterna 0.72.3 JS.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp, fastsqrt } from "../num.js";
import { tap_size } from "./IntervalInfo.js";
import { metaItvInfo } from "./MetaIntervalInfo.js";

/// Hand-Agnostic PatternMod detecting Jumpstream.
/// Looks for jacks, jumptrills, and jumps (2-chords)
export class JSMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.JS;
  // const std::vector<CalcPatternMod> _dbg = { JSS, JSJ };
  readonly name = "JSMod";
  readonly _tap_size = tap_size.jump;

  // #pragma region params
  min_mod = 0.6;
  max_mod = 1.1;
  mod_base = 0.0;
  prop_buffer = 1.0;

  total_prop_min = this.min_mod;
  total_prop_max = this.max_mod;
  total_prop_scaler = 2.714; // ~19/7

  split_hand_pool = 1.5;
  split_hand_min = 0.9;
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

  // inline void set_dbg(std::vector<float> doot[], const int& i)
  //{
  //		doot[JSS][i] = jumptrill_prop;
  //		doot[JSJ][i] = jack_prop;
  //}

  full_reset(): void {
    this.last_mod = this.min_mod;
  }

  decay_mod(): void {
    this.pmod = clamp(this.last_mod - this.decay_factor, this.min_mod, this.max_mod);
    this.last_mod = this.pmod;
  }

  operator(mitvi: metaItvInfo): number {
    const itvi = mitvi._itvi;

    // empty interval, don't decay js mod or update last_mod
    if (itvi.total_taps === 0) {
      return neutral;
    }

    // at least 1 tap but no jumps
    if (itvi.taps_by_size[this._tap_size] === 0) {
      this.decay_mod();
      return this.pmod;
    }

    /* end case optimizations */

    this.t_taps = itvi.total_taps;

    // creepy banana
    this.total_prop =
      ((itvi.taps_by_size[this._tap_size]! + this.prop_buffer) /
        (this.t_taps - this.prop_buffer)) *
      this.total_prop_scaler;
    this.total_prop = clamp(
      fastsqrt(this.total_prop),
      this.total_prop_min,
      this.total_prop_max,
    );

    // punish lots splithand jumptrills
    // uhh this might also catch oh jumptrills can't remember
    this.jumptrill_prop = clamp(
      this.split_hand_pool - mitvi.not_js / this.t_taps,
      this.split_hand_min,
      this.split_hand_max,
    );

    // downscale by jack density rather than upscale like cj
    // theoretically the ohjump downscaler should handle
    // this but handling it here gives us more flexbility
    // with the ohjump mod
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
