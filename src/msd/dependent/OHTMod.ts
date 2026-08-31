// Port of Etterna 0.72.3 Dependent/OHT.h

import { CalcPatternMod, neutral } from "../enums.js";
import { meta_type } from "./HD_MetaSequencing.js";
import { clamp } from "../num.js";
import { CalcMovingWindow, max_moving_window_size } from "../window.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/* this is complex enough it should probably have its own sequencer, there's
 * also a fair bit of redundancy between this, wrjt, wrr. Currently this has the
 * best component construction for the pmod so maybe the other mods should use
 * this as a template? */

export const max_trills_per_interval = 4;

/// Hand-Dependent PatternMod detecting one hand trills.
/// almost identical to wrr, refer to comments there
export class OHTrillMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.OHTrill;
  readonly name = "OHTrillMod";

  // #pragma region params

  window_param = 3.0;

  min_mod = 0.9;
  max_mod = 1.0;
  base = 1.35;
  suppression = 0.4;

  cv_reset = 1.0;
  cv_threshhold = 0.5;

  // #pragma endregion params and param map

  window = 0;
  cc_window = 0;

  luca_turilli = false;

  // ok new plan, ohj, wrjt and wrr are relatively well tuned so i'll try this
  // here, handle merging multiple sequences in a single interval into one
  // value at interval end and keep a window of that. suppose we have two
  // intervals of 12 notes with 8 in trill formation, one has an 8 note trill
  // and the other has two 4 note trills at the start/end, we want to punish
  // the 8 note trill harder, this means we _will_ be resetting the
  // consecutive trill counter every interval, but will not be resetting the
  // trilling flag, this way we don't have to futz around with awkward
  // proportion math, similar to thing 1 and thing 2
  badjuju = new CalcMovingWindow<number>();
  _mw_oht_taps = new CalcMovingWindow<number>();

  // C++: std::array<int, max_trills_per_interval> foundyatrills = { 0, 0, 0, 0 };
  foundyatrills: number[] = [0, 0, 0, 0];

  found_oht = 0;
  oht_len = 0;
  oht_taps = 0;

  hello_my_name_is_goat = 0.0;

  moving_cv = this.cv_reset;
  pmod = this.min_mod;

  // #pragma region generic functions

  full_reset(): void {
    this.badjuju.zero();
    this._mw_oht_taps.zero();

    this.luca_turilli = false;
    this.found_oht = 0;
    this.oht_len = 0;

    // C++: for (auto& v : foundyatrills) { v = 0; }
    this.foundyatrills.fill(0);

    this.moving_cv = this.cv_reset;
    this.pmod = neutral;
  }

  setup(): void {
    this.window = clamp(Math.trunc(this.window_param), 1, max_moving_window_size);
    this.cc_window = clamp(Math.trunc(this.window_param), 1, max_moving_window_size);
  }

  // #pragma endregion

  make_thing(itv_taps: number): number {
    this.hello_my_name_is_goat = 0.0;

    if (this.found_oht === 0) {
      return 0.0;
    }

    for (const v of this.foundyatrills) {
      if (v === 0) {
        continue;
      }

      // water down smaller sequences
      this.hello_my_name_is_goat = v / itv_taps - this.suppression;
    }
    return clamp(this.hello_my_name_is_goat, 0.1, 1.0);
  }

  complete_seq(): void {
    if (!this.luca_turilli || this.oht_len === 0) {
      return;
    }

    if (this.found_oht < max_trills_per_interval) {
      this.foundyatrills[this.found_oht] = this.oht_len;
    }

    this.luca_turilli = false;
    this.oht_len = 0;
    ++this.found_oht;
    this.moving_cv = (this.moving_cv + this.cv_reset) / 2.0;
  }

  oht_timing_check(ms_any: CalcMovingWindow<number>): boolean {
    this.moving_cv =
      (this.moving_cv + ms_any.get_cv_of_window(this.cc_window)) / 2.0;
    // the primary difference from wrr, just check cv on the base ms values,
    // we are looking for values that are all close together without any
    // manipulation
    return this.moving_cv < this.cv_threshhold;
  }

  wifflewaffle(): void {
    if (this.luca_turilli) {
      ++this.oht_len;
      ++this.oht_taps;
    } else {
      this.luca_turilli = true;
      this.oht_len += 3;
      this.oht_taps += 3;
    }
  }

  advance_sequencing(mt: meta_type, ms_any: CalcMovingWindow<number>): void {
    switch (mt) {
      case meta_type.meta_cccccc:
        if (this.oht_timing_check(ms_any)) {
          this.wifflewaffle();
        } else {
          this.complete_seq();
        }
        break;
      case meta_type.meta_ccacc:
        // wait to see what happens
        break;
      case meta_type.meta_enigma:
      case meta_type.meta_meta_enigma:
      // also wait to see what happens, but not if last was ccacc,
      // since we only don't complete there if we don't immediately go
      // back into ohts

      // this seems to be overkill with how lose the detection is
      // already anyway

      // if (now.last_cc == meta_ccacc) {
      //	complete_seq();
      //}
      // break;
      default:
        this.complete_seq();
        break;
    }
  }

  set_pmod(itvhi: ItvHandInfo): void {
    // no taps, no trills
    if (
      itvhi.get_taps_windowi(this.window) === 0 ||
      this._mw_oht_taps.get_total_for_window(this.window) === 0
    ) {
      this.pmod = neutral;
      return;
    }

    // full oht
    if (
      itvhi.get_taps_windowi(this.window) ===
      this._mw_oht_taps.get_total_for_window(this.window)
    ) {
      this.pmod = this.min_mod;
      return;
    }

    this.badjuju.operator(this.make_thing(itvhi.get_taps_nowf()));

    this.pmod = this.base - this.badjuju.get_mean_of_window(this.window);
    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
  }

  operator(itvhi: ItvHandInfo): number {
    if (this.oht_len > 0 && this.found_oht < max_trills_per_interval) {
      this.foundyatrills[this.found_oht] = this.oht_len;
      ++this.found_oht;
    }

    this._mw_oht_taps.operator(this.oht_taps);

    this.set_pmod(itvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    this.foundyatrills.fill(0);
    this.found_oht = 0;
    this.oht_len = 0;
    this.oht_taps = 0;
  }
}
