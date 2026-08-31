// Port of Etterna 0.72.3 Dependent/HD_PatternMods/RunningMan.h

import { CalcPatternMod, col_type, neutral } from "../enums.js";
import { clamp, fastsqrt } from "../num.js";
import { RM_Sequencer, rm_status } from "./RMSequencing.js";
import { base_type } from "./HD_BasicSequencing.js";
import { meta_type } from "./HD_MetaSequencing.js";
import { ct_loop_no_jumps, num_cols_per_hand } from "./HD_BasicSequencing.js";
import type { AnchorSequencer } from "./GenericSequencing.js";

/** Hand-Dependent PatternMod detecting RunningMen. */
export class RunningManMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.RanMan;
  readonly name = "RunningManMod";

  // params
  min_mod = 1.0;
  max_mod = 1.1;
  base = 0.5;
  min_anchor_len = 5.0;
  min_taps_in_rm = 1.0;
  min_off_taps_same = 1.0;

  offhand_tap_prop_scaler = 1.0;
  offhand_tap_prop_min = 0.0;
  offhand_tap_prop_max = 1.0;
  offhand_tap_prop_base = 1.7;

  offhand_tap_prop_anch_diff_base = 1.7;
  offhand_tap_prop_anch_diff_scaler = 1.1;
  offhand_tap_prop_anch_diff_min = 0.75;
  offhand_tap_prop_anch_diff_max = 1.0;

  off_tap_same_prop_scaler = 1.0;
  off_tap_same_prop_min = 0.0;
  off_tap_same_prop_max = 1.25;
  off_tap_same_prop_base = 0.8;

  anchor_len_divisor = 5.0;
  anchor_len_comp_min = 0.0;
  anchor_len_comp_max = 1.25;

  min_jack_taps_for_bonus = 1.0;
  jack_bonus_base = 0.1;

  min_oht_taps_for_bonus = 1.0;
  oht_bonus_base = 0.1;

  // params for rm_sequencing, these define conditions for resetting
  // runningmen sequences
  max_oht_len = 2.0;
  max_off_len = 3.0;
  max_ot_sh_len = 2.0;
  max_burst_len = 6.0;
  max_jack_len = 3.0;
  max_anch_len = 5.0;

  // stuff for making mod
  rms: RM_Sequencer[] = Array.from({ length: num_cols_per_hand }, () => new RM_Sequencer());

  // for an interval, active rm sequence with the highest difficulty
  highest_rm = new RM_Sequencer();

  test = 0;
  offhand_tap_prop = 0.0;
  off_tap_same_prop = 0.0;

  anchor_len_comp = 0.0;
  jack_bonus = 0.0;
  oht_bonus = 0.0;

  pmod = neutral;

  full_reset(): void {
    for (const rm of this.rms) {
      rm.full_reset();
    }

    this.offhand_tap_prop = 0.0;
    this.off_tap_same_prop = 0.0;

    this.anchor_len_comp = 0.0;
    this.jack_bonus = 0.0;
    this.oht_bonus = 0.0;

    this.pmod = neutral;
  }

  /* keep parallel rm sequencers for both left and right column for each
   * hand, this way we don't have to worry about trying to figure out
   * which column the runningman anchor should be on */
  setup(): void {
    for (const c of ct_loop_no_jumps) {
      this.rms[c]!._ct = c;
      this.rms[c]!.set_params(
        this.max_oht_len,
        this.max_off_len,
        this.max_ot_sh_len,
        this.max_burst_len,
        this.max_jack_len,
        this.max_anch_len,
      );
    }
  }

  advance_off_hand_sequencing(): void {
    for (const c of ct_loop_no_jumps) {
      this.rms[c]!.advance_off_hand_sequencing();
    }
  }

  advance_sequencing(ct: col_type, bt: base_type, mt: meta_type, as: AnchorSequencer): void {
    for (const c of ct_loop_no_jumps) {
      this.rms[c]!.operator(ct, bt, mt, as.anch[c]!);
    }

    this.highest_rm = this.get_active_rm_with_higher_difficulty();
  }

  get_highest_anchor_difficulty(): number {
    /* see off_hand_tap_prop for a detailed explanation, basically only the
     * rm mod was downscaling rolls, short burst rolls that escaped roll
     * detection but flagged high on on rm diff were super overrated without
     * this adjustment */

    let oht_p =
      this.offhand_tap_prop_anch_diff_base -
      this.highest_rm._rm.get_offhand_tap_prop() * this.offhand_tap_prop_anch_diff_scaler;

    oht_p = clamp(
      oht_p,
      this.offhand_tap_prop_anch_diff_min,
      this.offhand_tap_prop_anch_diff_max,
    );

    return this.highest_rm.get_difficulty() * oht_p;
  }

  get_active_rm_with_higher_difficulty(): RM_Sequencer {
    if (
      this.rms[col_type.col_left]!._status === rm_status.rm_running &&
      this.rms[col_type.col_right]!._status === rm_status.rm_running
    ) {
      return this.rms[col_type.col_left]!.get_difficulty() >
        this.rms[col_type.col_right]!.get_difficulty()
        ? this.rms[col_type.col_left]!.copy()
        : this.rms[col_type.col_right]!.copy();
    }

    return this.rms[col_type.col_left]!._status === rm_status.rm_running
      ? this.rms[col_type.col_left]!.copy()
      : this.rms[col_type.col_right]!.copy();
  }

  /* Note: this mod is only used for pushing up runningmen focused stream/js
   * _patterns_, the anchor difficulty isn't used here, that's used in tech. */
  set_pmod(total_taps: number): void {
    /* nothing here */
    if (total_taps === 0) {
      this.pmod = neutral;
      return;
    }

    const rm = this.highest_rm._rm;

    /* we could decay in this but it may conflict/be redundant with how
     * runningmen sequences are constructed */

    // min mod optimization
    if (
      rm._len < this.min_anchor_len ||
      rm.ran_taps < this.min_taps_in_rm ||
      rm.off_taps_sh < this.min_off_taps_same
    ) {
      this.pmod = this.min_mod;
      return;
    }

    /* the larger the share of off hand taps to anchor taps, the higher the
     * probability we're just looking at something like rolls */
    this.offhand_tap_prop =
      this.offhand_tap_prop_base - rm.get_offhand_tap_prop() * this.offhand_tap_prop_scaler;
    this.offhand_tap_prop = clamp(
      this.offhand_tap_prop,
      this.offhand_tap_prop_min,
      this.offhand_tap_prop_max,
    );

    /* number of same hand off anchor taps / anchor taps */
    this.off_tap_same_prop =
      this.off_tap_same_prop_base + rm.get_off_tap_same_prop() * this.off_tap_same_prop_scaler;

    this.off_tap_same_prop = clamp(
      this.off_tap_same_prop,
      this.off_tap_same_prop_min,
      this.off_tap_same_prop_max,
    );

    /* anchor length component, we want longer runningmen to inherently
     * register more strongly, but not to an infinite degree */
    this.anchor_len_comp = rm._len / this.anchor_len_divisor;
    this.anchor_len_comp = clamp(
      this.anchor_len_comp,
      this.anchor_len_comp_min,
      this.anchor_len_comp_max,
    );

    // jacks in anchor component, give a small bonus i guess
    this.jack_bonus = rm.jack_taps >= this.min_jack_taps_for_bonus ? this.jack_bonus_base : 0.0;

    // ohts in anchor component, give a small bonus i guess
    this.oht_bonus = rm.oht_taps >= this.min_oht_taps_for_bonus ? this.oht_bonus_base : 0.0;

    this.pmod = this.base + this.anchor_len_comp + this.jack_bonus + this.oht_bonus;
    this.pmod = clamp(
      fastsqrt(this.pmod * this.off_tap_same_prop * this.offhand_tap_prop),
      this.min_mod,
      this.max_mod,
    );
  }

  operator(total_taps: number): number {
    this.set_pmod(total_taps);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    this.highest_rm.full_reset();
  }
}
