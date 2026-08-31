// Port of Etterna 0.72.3 Dependent/VOHT.h

import { CalcPatternMod, neutral } from "../enums.js";
import { meta_type } from "./HD_MetaSequencing.js";
import { clamp } from "../num.js";
import { CalcMovingWindow, max_moving_window_size } from "../window.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/* retuned oht mod focus tuned to for catching vibro trills like bagatelle */

export const max_vtrills_per_interval = 4;

/// Hand-Dependent PatternMod detecting one hand trills.
/// Specific meant to downscale long continuous one hand trills
/// to nerf jumpjack vibro.
/// almost identical to wrr, refer to comments there
export class VOHTrillMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.VOHTrill;
  readonly name = "VOHTrillMod";

  // #pragma region params

  window_param = 2.0;

  min_mod = 0.25;
  max_mod = 1.0;
  base = 1.5;
  suppression = 0.2;

  cv_reset = 1.0;
  cv_threshhold = 0.25;

  min_len = 8.0;

  // #pragma endregion params and param map

  window = 0;
  cc_window = 0;

  luca_turilli = false;

  badjuju = new CalcMovingWindow<number>();
  _mw_oht_taps = new CalcMovingWindow<number>();

  // C++: std::array<int, max_vtrills_per_interval> foundyatrills = { 0, 0, 0, 0 };
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

    if (this.found_oht < max_vtrills_per_interval) {
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

    if (this._mw_oht_taps.get_total_for_window(this.window) < this.min_len) {
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
    if (this.oht_len > 0 && this.found_oht < max_vtrills_per_interval) {
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
