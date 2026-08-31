// Port of Etterna 0.72.3 Dependent/CJOHJ.h

import { col_type, CalcPatternMod, neutral } from "../enums.js";
import { base_type } from "./HD_BasicSequencing.js";
import { clamp } from "../num.js";
import type { metaItvHandInfo } from "./MetaIntervalHandInfo.js";
import { OHJ_Sequencer } from "./OHJSequencing.js";

/// Hand-Dependent PatternMod detecting one hand jumps.
/// This is used specifically for Chordjacks.
/// initially copied from ohj but the logic should probably be adjusted on
/// multiple levels
export class CJOHJumpMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.CJOHJump;
  readonly name = "CJOHJumpMod";

  // #pragma region params

  min_mod = 0.57;
  max_mod = 1.0;

  prop_pool = 1.0;
  prop_scaler = 0.63;

  // #pragma endregion params and param map

  ohj = new OHJ_Sequencer();
  max_ohjump_seq_taps = 0;

  // number of jumps scaled to total taps in hand
  base_seq_prop = 0.0;
  // size of sequence scaled to total taps in hand
  base_jump_prop = 0.0;

  prop_component = neutral;
  pmod = neutral;

  // #pragma region generic functions

  full_reset(): void {
    this.ohj.zero();

    this.max_ohjump_seq_taps = 0;

    this.base_seq_prop = 0.0;
    this.base_jump_prop = 0.0;

    this.prop_component = neutral;
    this.pmod = neutral;
  }

  // #pragma endregion

  advance_sequencing(ct: col_type, bt: base_type): void {
    this.ohj.operator(ct, bt);
  }

  // build component based on number of jumps relative to hand taps
  set_prop_comp(): void {
    this.prop_component =
      this.prop_pool - this.base_jump_prop * this.prop_scaler;
    this.prop_component =
      this.prop_component < 0.1 ? 0.1 : this.prop_component;
  }

  set_pmod(mitvhi: metaItvHandInfo): void {
    const itvhi = mitvhi._itvhi;

    // if cur_seq > max when we ended the interval, grab it
    this.max_ohjump_seq_taps =
      this.ohj.cur_seq_taps > this.ohj.max_seq_taps
        ? this.ohj.cur_seq_taps
        : this.ohj.max_seq_taps;

    /* case optimization start */

    // nothing here or there are no ohjumps
    if (
      itvhi.get_taps_nowi() === 0 ||
      itvhi.get_col_taps_nowi(col_type.col_ohjump) === 0
    ) {
      this.pmod = neutral;
      return;
    }

    // everything in the interval is in an ohj sequence
    if (this.max_ohjump_seq_taps >= itvhi.get_taps_nowi()) {
      this.pmod = this.min_mod;
      return;
    }

    // floats for less casting
    // these should always be whole numbers
    const ohjcount = itvhi.get_col_taps_nowf(col_type.col_ohjump) / 2.0;
    const tapcount =
      itvhi.get_col_taps_nowf(col_type.col_left) - ohjcount +
      (itvhi.get_col_taps_nowf(col_type.col_right) - ohjcount);
    const rows = ohjcount + tapcount;

    this.base_jump_prop = ohjcount / rows;
    this.set_prop_comp();
    this.prop_component = clamp(this.prop_component, 0.1, this.max_mod);

    this.pmod = this.prop_component;
    this.pmod = clamp(this.pmod, this.min_mod, this.max_mod);
  }

  operator(mitvhi: metaItvHandInfo): number {
    this.set_pmod(mitvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    // reset any interval stuff here
    this.ohj.max_seq_taps = 0;
    this.max_ohjump_seq_taps = 0;
  }
}
