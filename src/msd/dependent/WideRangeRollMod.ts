// Port of Etterna 0.72.3 Dependent/HD_PatternMods/WideRangeRoll.h

import { CalcPatternMod, neutral } from "../enums.js";
import { any_ms_is_greater, clamp, cv, fastsqrt } from "../num.js";
import { CalcMovingWindow, max_moving_window_size } from "../window.js";
import { base_type } from "./HD_BasicSequencing.js";
import { meta_type } from "./HD_MetaSequencing.js";
import type { ItvHandInfo } from "./IntervalHandInfo.js";

/** Hand-Dependent PatternMod detecting continuous rolls. */
export class WideRangeRollMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.WideRangeRoll;
  readonly name = "WideRangeRollMod";

  // params
  window_param = 5.0;

  min_mod = 0.25;
  max_mod = 1.0;
  base = 0.15;
  scaler = 0.9;

  cv_reset = 1.0;
  cv_threshold = 0.35;
  other_cv_threshold = 0.3;

  window = 0;

  // moving window of longest roll sequences seen in the interval
  _mw_max = new CalcMovingWindow<number>();

  // we want to keep custom adjusted ms values here
  _mw_adj_ms = new CalcMovingWindow<number>();

  last_passed_check = false;
  nah_this_file_aint_for_real = 0;
  max_thingy = 0;
  hi_im_a_float = 0.0;

  idk_ms: number[] = [0.0, 0.0, 0.0, 0.0];
  seq_ms: number[] = [0.0, 0.0, 0.0];

  moving_cv = this.cv_reset;
  pmod = this.min_mod;

  full_reset(): void {
    this._mw_max.zero();
    this._mw_adj_ms.zero();

    this.last_passed_check = false;
    this.nah_this_file_aint_for_real = 0;
    this.max_thingy = 0;
    this.hi_im_a_float = 0.0;

    for (let i = 0; i < this.seq_ms.length; ++i) this.seq_ms[i] = 0.0;
    for (let i = 0; i < this.idk_ms.length; ++i) this.idk_ms[i] = 0.0;

    this.moving_cv = this.cv_reset;
    this.pmod = neutral;
  }

  setup(): void {
    this.window = clamp(Math.trunc(this.window_param), 1, max_moving_window_size);
  }

  zoop_the_woop(pos: number, div: number, scaler = 1.0): void {
    this.seq_ms[pos]! /= div;
    this.last_passed_check = this.do_timing_thing(scaler);
    this.seq_ms[pos]! *= div;
  }

  woop_the_zoop(pos: number, mult: number, scaler = 1.0): void {
    this.seq_ms[pos]! *= mult;
    this.last_passed_check = this.do_timing_thing(scaler);
    this.seq_ms[pos]! /= mult;
  }

  do_timing_thing(scaler: number): boolean {
    this._mw_adj_ms.operator(this.seq_ms[1]!);

    if (this._mw_adj_ms.get_cv_of_window(this.window) > this.other_cv_threshold) {
      return false;
    }

    this.hi_im_a_float = cv(this.seq_ms);

    // ok we're pretty sure it's a roll don't bother with the test
    if (this.hi_im_a_float < 0.12) {
      this.moving_cv = (this.hi_im_a_float + this.moving_cv + this.hi_im_a_float) / 3.0;
      return true;
    }
    this.moving_cv = (this.hi_im_a_float + this.moving_cv) / 2.0;

    return this.moving_cv < this.cv_threshold / scaler;
  }

  do_other_timing_thing(scaler: number): boolean {
    this._mw_adj_ms.operator(this.idk_ms[1]!);
    this._mw_adj_ms.operator(this.idk_ms[2]!);

    if (this._mw_adj_ms.get_cv_of_window(this.window) > this.other_cv_threshold) {
      return false;
    }

    this.hi_im_a_float = cv(this.idk_ms);

    // ok we're pretty sure it's a roll don't bother with the test
    if (this.hi_im_a_float < 0.12) {
      this.moving_cv = (this.hi_im_a_float + this.moving_cv + this.hi_im_a_float) / 3.0;
      return true;
    }
    this.moving_cv = (this.hi_im_a_float + this.moving_cv) / 2.0;

    return this.moving_cv < this.cv_threshold / scaler;
  }

  handle_ccacc_timing_check(): void {
    this.zoop_the_woop(1, 2.5, 1.25);
  }

  handle_roll_timing_check(): void {
    if (any_ms_is_greater(this.seq_ms[1]!, this.seq_ms[0]!)) {
      this.zoop_the_woop(1, 2.5);
    } else {
      this.seq_ms[0]! /= 2.5;
      this.seq_ms[2]! /= 2.5;
      this.last_passed_check = this.do_timing_thing(1.0);
      this.seq_ms[0]! *= 2.5;
      this.seq_ms[2]! *= 2.5;
    }
  }

  handle_ccsjjscc_timing_check(now: number): void {
    // translate over the values
    this.idk_ms[2] = this.seq_ms[0]!;
    this.idk_ms[1] = this.seq_ms[1]!;
    this.idk_ms[0] = this.seq_ms[2]!;

    // add the new value
    this.idk_ms[3] = now;

    // run 2 tests so we can keep a stricter cutoff
    // check 1
    this.idk_ms[1]! /= 2.5;
    this.idk_ms[2]! /= 2.5;

    this.do_other_timing_thing(1.25);

    this.idk_ms[1]! *= 2.5;
    this.idk_ms[2]! *= 2.5;

    if (this.last_passed_check) {
      return;
    }

    // test again
    this.idk_ms[1]! /= 3.0;
    this.idk_ms[2]! /= 3.0;

    this.do_other_timing_thing(1.25);

    this.idk_ms[1]! *= 3.0;
    this.idk_ms[2]! *= 3.0;
  }

  complete_seq(): void {
    if (this.nah_this_file_aint_for_real > 0) {
      this.max_thingy =
        this.nah_this_file_aint_for_real > this.max_thingy
          ? this.nah_this_file_aint_for_real
          : this.max_thingy;
    }
    this.nah_this_file_aint_for_real = 0;
  }

  bibblybop(_last_mt: meta_type): void {
    // see below
    if (_last_mt === meta_type.meta_enigma) {
      this.moving_cv = (this.moving_cv + this.hi_im_a_float) / 2.0;
    } else if (_last_mt === meta_type.meta_meta_enigma) {
      this.moving_cv = (this.moving_cv + this.hi_im_a_float + this.hi_im_a_float) / 3.0;
    }

    if (!this.last_passed_check) {
      this.complete_seq();
      return;
    }

    ++this.nah_this_file_aint_for_real;

    // if we are here and mt.last == meta enigma, we skipped 1 note
    // before we identified a jumptrillable roll continuation, if meta
    // meta enigma, 2

    // borp it
    if (_last_mt === meta_type.meta_enigma) {
      ++this.nah_this_file_aint_for_real;
    }

    // same but even more-er
    if (_last_mt === meta_type.meta_meta_enigma) {
      this.nah_this_file_aint_for_real += 2;
    }
  }

  advance_sequencing(
    bt: base_type,
    mt: meta_type,
    _last_mt: meta_type,
    any_ms: number,
    tc_ms: number,
  ): void {
    // we will let ohjumps through here

    this.update_seq_ms(bt, any_ms, tc_ms);
    if (bt === base_type.base_single_jump || bt === base_type.base_jump_single) {
      return;
    }

    if (bt === base_type.base_jump_jump) {
      // its an actual jumpjack/jumptrill, don't bother with timing checks
      if (this.nah_this_file_aint_for_real > 0) {
        this.bibblybop(_last_mt);
      }
      return;
    }

    // look for stuff thats jumptrillyable.. if that stuff... then leads
    // into more stuff.. that is jumptrillyable... then .... badonk it
    switch (mt) {
      case meta_type.meta_acca:
        // unlike wrjt we want to complete and reset on these
        this.complete_seq();
        break;
      case meta_type.meta_cccccc:
        this.handle_roll_timing_check();
        this.bibblybop(_last_mt);
        break;
      case meta_type.meta_ccacc:
        this.handle_ccacc_timing_check();
        this.bibblybop(_last_mt);
        break;
      case meta_type.meta_ccsjjscc:
      case meta_type.meta_ccsjjscc_inverted:
        this.handle_ccsjjscc_timing_check(any_ms);
        this.bibblybop(_last_mt);
        break;
      case meta_type.meta_type_init:
      case meta_type.meta_enigma:
        // this could yet be something we are interested in, but we
        // don't know yet, so just wait and see
        break;
      case meta_type.meta_meta_enigma:
      case meta_type.meta_unknowable_enigma:
        // it's been too long...
        this.complete_seq();
        break;
      default:
        break;
    }
  }

  update_seq_ms(bt: base_type, any_ms: number, tc_ms: number): void {
    this.seq_ms[0] = this.seq_ms[1]!; // last_last
    this.seq_ms[1] = this.seq_ms[2]!; // last

    // update now
    // for anchors, track tc_ms
    if (bt === base_type.base_single_single) {
      this.seq_ms[2] = tc_ms;
      // for base_left_right or base_right_left, track cc_ms
    } else {
      this.seq_ms[2] = any_ms;
    }
  }

  set_pmod(itvhi: ItvHandInfo): void {
    // check taps for _this_ interval, if there's none, and there was a
    // powerful roll mod before, the roll mod will extend into the empty
    // interval at minimum value due to 0/n
    if (
      itvhi.get_taps_nowi() === 0 ||
      itvhi.get_taps_windowi(this.window) === 0 ||
      this._mw_max.get_total_for_window(this.window) === 0
    ) {
      this.pmod = neutral;
      return;
    }

    // really uncertain about the using the total of _mw_max here, but
    // that's what it was, so i'll keep it for now
    const zomg =
      itvhi.get_taps_windowf(this.window) / this._mw_max.get_total_for_windowf(this.window);

    this.pmod *= zomg;
    this.pmod = clamp(this.base + fastsqrt(this.pmod), this.min_mod, this.max_mod);
  }

  operator(itvhi: ItvHandInfo): number {
    this.max_thingy =
      this.nah_this_file_aint_for_real > this.max_thingy
        ? this.nah_this_file_aint_for_real
        : this.max_thingy;

    this._mw_max.operator(this.max_thingy);

    this.set_pmod(itvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    this.max_thingy = 0;
  }
}
