// Port of Etterna 0.72.3 Dependent/HD_PatternMods/WideRangeJumptrill.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp } from "../num.js";
import { CalcMovingWindow, max_moving_window_size } from "../window.js";
import { base_type } from "./HD_BasicSequencing.js";
import { meta_type } from "./HD_MetaSequencing.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

// big brain stuff
export const wrjt_cv_factor = 3.0;

/** Hand-Dependent PatternMod detecting Jumptrills. */
export class WideRangeJumptrillMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.WideRangeJumptrill;
  readonly name = "WideRangeJumptrillMod";

  // params
  window_param = 3.0;

  min_mod = 0.25;
  max_mod = 1.0;

  cv_threshhold = 0.05;

  window = 0;
  _mw_jt = new CalcMovingWindow<number>();
  jt_counter = 0;

  bro_is_this_file_for_real = false;
  last_passed_check = false;

  pmod = neutral;

  seq_ms: number[] = [0.0, 0.0, 0.0];

  full_reset(): void {
    this._mw_jt.zero();
    this.jt_counter = 0;
    this.seq_ms = [0.0, 0.0, 0.0];

    this.bro_is_this_file_for_real = false;
    this.last_passed_check = false;
    this.pmod = neutral;
  }

  setup(): void {
    this.window = clamp(Math.trunc(this.window_param), 1, max_moving_window_size);
  }

  check_last_mt(mt: meta_type): boolean {
    if (
      mt === meta_type.meta_acca ||
      mt === meta_type.meta_ccacc ||
      mt === meta_type.meta_cccccc
    ) {
      if (this.last_passed_check) {
        return true;
      }
    }
    return false;
  }

  bibblybop(mt: meta_type): void {
    ++this.jt_counter;
    if (this.bro_is_this_file_for_real) {
      ++this.jt_counter;
    }
    if (this.check_last_mt(mt)) {
      ++this.jt_counter;
      this.bro_is_this_file_for_real = true;
    }
  }

  advance_sequencing(
    bt: base_type,
    mt: meta_type,
    _last_mt: meta_type,
    ms_any: CalcMovingWindow<number>,
  ): void {
    // ignore if we hit a jump
    if (bt === base_type.base_jump_jump || bt === base_type.base_single_jump) {
      return;
    }

    // look for stuff thats jumptrillyable.. if that stuff... then leads
    // into more stuff.. that is jumptrillyable... then .... badonk it
    switch (mt) {
      case meta_type.meta_cccccc:
        if (
          (this.last_passed_check = ms_any.roll_timing_check(
            wrjt_cv_factor,
            this.cv_threshhold,
          ))
        ) {
          this.bibblybop(_last_mt);
          return;
        }
        break;
      case meta_type.meta_ccacc:
        if (
          (this.last_passed_check = ms_any.ccacc_timing_check(
            wrjt_cv_factor,
            this.cv_threshhold,
          ))
        ) {
          this.bibblybop(_last_mt);
          return;
        }
        break;
      case meta_type.meta_acca:
        // don't bother adding if the ms values look benign
        if (
          (this.last_passed_check = ms_any.acca_timing_check(
            wrjt_cv_factor,
            this.cv_threshhold,
          ))
        ) {
          this.bibblybop(_last_mt);
          return;
        }
        break;
      default:
        break;
    }

    this.bro_is_this_file_for_real = false;
  }

  set_pmod(itvhi: ItvHandInfo): void {
    // no taps, no jt
    if (
      itvhi.get_taps_windowi(this.window) === 0 ||
      this._mw_jt.get_total_for_window(this.window) === 0
    ) {
      this.pmod = neutral;
      return;
    }

    if (this._mw_jt.get_total_for_window(this.window) < 20) {
      this.pmod = neutral;
      return;
    }

    this.pmod =
      (itvhi.get_taps_windowf(this.window) /
        this._mw_jt.get_total_for_windowf(this.window)) *
      0.75;

    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
  }

  operator(itvhi: ItvHandInfo): number {
    this._mw_jt.operator(this.jt_counter);

    this.set_pmod(itvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    // we could count these in metanoteinfo but let's do it here for now,
    // reset every interval when finished
    this.jt_counter = 0;
  }
}
