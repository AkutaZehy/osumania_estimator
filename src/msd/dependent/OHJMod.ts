// Port of Etterna 0.72.3 Dependent/OHJ.h

import { col_type, CalcPatternMod, neutral } from "../enums.js";
import {
  base_type,
  base_left_right,
  base_right_left,
} from "./HD_BasicSequencing.js";
import { clamp, fastsqrt, weighted_average } from "../num.js";
import type { metaItvHandInfo } from "./MetaIntervalHandInfo.js";
import { OHJ_Sequencer } from "./OHJSequencing.js";

/// Hand-Dependent PatternMod detecting one hand jumps.
/// Looks for one hand jumps in general in the interval.
/// Utilizes sequencing to find continuous one hand jumps.
export class OHJumpModGuyThing {
  readonly _pmod: CalcPatternMod = CalcPatternMod.OHJumpMod;
  readonly name = "OHJumpMod";

  // #pragma region params

  min_mod = 0.75;
  max_mod = 1.0;

  max_seq_weight = 0.65;
  max_seq_pool = 1.2;
  max_seq_scaler = 2.0;

  prop_pool = 1.5;
  prop_scaler = 1.0;

  // #pragma endregion params and param map

  ohj = new OHJ_Sequencer();
  max_ohjump_seq_taps = 0;
  cc_taps = 0;

  floatymcfloatface = 0.0;
  // number of jumps scaled to total taps in hand
  base_seq_prop = 0.0;
  // size of sequence scaled to total taps in hand
  base_jump_prop = 0.0;

  max_seq_component = neutral;
  prop_component = neutral;
  pmod = neutral;

  // #pragma region generic functions

  full_reset(): void {
    this.ohj.zero();

    this.max_ohjump_seq_taps = 0;
    this.cc_taps = 0;

    this.floatymcfloatface = 0.0;
    this.base_seq_prop = 0.0;
    this.base_jump_prop = 0.0;

    this.max_seq_component = neutral;
    this.prop_component = neutral;
    this.pmod = neutral;
  }

  // #pragma endregion

  advance_sequencing(ct: col_type, bt: base_type): void {
    this.ohj.operator(ct, bt);
  }

  // build component based on max sequence relative to hand taps
  set_max_seq_comp(): void {
    this.max_seq_component =
      this.max_seq_pool - this.base_seq_prop * this.max_seq_scaler;
    this.max_seq_component =
      this.max_seq_component < 0.1 ? 0.1 : this.max_seq_component;
    this.max_seq_component = fastsqrt(this.max_seq_component);
  }

  // build component based on number of jumps relative to hand taps
  set_prop_comp(): void {
    this.prop_component =
      this.prop_pool - this.base_jump_prop * this.prop_scaler;
    this.prop_component =
      this.prop_component < 0.1 ? 0.1 : this.prop_component;
    this.prop_component = fastsqrt(this.prop_component);
  }

  set_pmod(mitvhi: metaItvHandInfo): void {
    const itvhi = mitvhi._itvhi;

    this.cc_taps =
      mitvhi._base_types[base_left_right]! +
      mitvhi._base_types[base_right_left]!;

    // if cur_seq > max when we ended the interval, grab it
    this.max_ohjump_seq_taps =
      this.ohj.cur_seq_taps > this.ohj.max_seq_taps
        ? this.ohj.cur_seq_taps
        : this.ohj.max_seq_taps;

    /* case optimization start */

    // nothing here or there are no ohjumps
    if (itvhi.get_taps_nowi() === 0 || itvhi.get_col_taps_nowi(col_type.col_ohjump) === 0) {
      this.pmod = neutral;
      return;
    }

    // everything in the interval is in an ohj sequence
    if (this.max_ohjump_seq_taps >= itvhi.get_taps_nowi()) {
      this.pmod = this.min_mod;
      return;
    }

    /* prop scaling only case */

    // no repeated oh jumps, prop scale only based on jumps taps in hand
    // taps if the jump was immediately broken by a cross column single tap
    // we can have values of 1, otherwise 2
    if (this.max_ohjump_seq_taps < 3) {
      // need to set now
      this.base_jump_prop =
        itvhi.get_col_taps_nowf(col_type.col_ohjump) / itvhi.get_taps_nowf();
      this.set_prop_comp();

      this.pmod = clamp(this.prop_component, this.min_mod, this.max_mod);
      return;
    }

    /* seq scaling only case */

    // if this is true we have some combination of single notes
    // and jumps where the single notes are all on the same
    // column
    if (this.cc_taps === 0) {
      // we don't want to treat 2[12][12][12]2222 2222[12][12][12]2
      // differently, so use the max sequence here exclusively
      // shortcut mod calculations, we need the base props now

      // build now
      this.floatymcfloatface = this.max_ohjump_seq_taps;
      this.base_seq_prop = this.floatymcfloatface / itvhi.get_taps_nowf();
      this.set_max_seq_comp();

      this.pmod = clamp(this.max_seq_component, this.min_mod, this.max_mod);
      return;
    }

    /* case optimization end */

    // for js we lean into max sequences more, since they're better
    // indicators of inflated difficulty

    // set either after case optimizations or in case optimizations, after
    // the simple checks, for optimization
    this.floatymcfloatface = this.max_ohjump_seq_taps;
    this.base_seq_prop = this.floatymcfloatface / mitvhi._itvhi.get_taps_nowf();
    this.set_max_seq_comp();
    this.max_seq_component = clamp(this.max_seq_component, 0.1, this.max_mod);

    this.base_jump_prop =
      itvhi.get_col_taps_nowf(col_type.col_ohjump) / itvhi.get_taps_nowf();
    this.set_prop_comp();
    this.prop_component = clamp(this.prop_component, 0.1, this.max_mod);

    this.pmod = weighted_average(
      this.max_seq_component,
      this.prop_component,
      this.max_seq_weight,
      1.0,
    );
    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
  }

  operator(mitvhi: metaItvHandInfo): number {
    this.set_pmod(mitvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    // reset any interval stuff here
    this.cc_taps = 0;
    this.ohj.max_seq_taps = 0;
    this.max_ohjump_seq_taps = 0;
  }
}
