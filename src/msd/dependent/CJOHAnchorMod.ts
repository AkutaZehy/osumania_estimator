// Port of Etterna 0.72.3 Dependent/CJOHAnchor.h

import { col_type, CalcPatternMod, neutral } from "../enums.js";
import { base_type } from "./HD_BasicSequencing.js";
import { clamp, fastsqrt, weighted_average } from "../num.js";
import type { metaItvHandInfo } from "./MetaIntervalHandInfo.js";
import { CJ_OHAnchor_Sequencer } from "./CJOHASequencing.js";

/// Hand-Dependent PatternMod detecting Chains.
/// Looks for jack into jump into jack on alternate finger.
/// Very lenient: accepts 11...1[12]...[12]2...22
/// Also accepts 11...1[12]...[12]1...11
export class CJOHAnchorMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.CJOHAnchor;
  readonly name = "CJOHAnchorMod";

  // #pragma region params

  min_mod = 1.0;
  max_mod = 1.1;
  base = 0.5;

  len_scaler = 0.2;
  anchor_len_weight = 1.0;
  swap_scaler = 0.10775;
  not_swap_scaler = 0.019;

  // #pragma endregion params and param map

  chain = new CJ_OHAnchor_Sequencer();
  max_chain_swaps = 0;
  max_not_swaps = 0;
  max_total_len = 0;
  max_anchor_len = 0;

  pmod = neutral;

  // #pragma region generic functions

  full_reset(): void {
    this.chain.zero();

    this.max_chain_swaps = 0;
    this.max_not_swaps = 0;
    this.max_total_len = 0;
    this.max_anchor_len = 0;

    this.pmod = neutral;
  }

  // #pragma endregion

  advance_sequencing(
    ct: col_type,
    bt: base_type,
    last_ct: col_type,
    any_ms: number,
  ): void {
    this.chain.operator(ct, bt, last_ct, any_ms);
  }

  set_pmod(mitvhi: metaItvHandInfo): void {
    const itvhi = mitvhi._itvhi;
    const base_types = mitvhi._base_types;

    // if cur > max when we ended the interval, grab it
    this.max_chain_swaps = this.chain.get_max_chain_swaps();
    this.max_not_swaps = this.chain.get_max_not_swaps();
    this.max_total_len = this.chain.get_max_total_len();
    this.max_anchor_len = this.chain.get_max_anchor_len();

    // nothing here
    if (itvhi.get_taps_nowi() === 0) {
      this.pmod = neutral;
      return;
    }

    // pmod = base + (sum)
    //	max anchor / total rows * scale
    //	max swaps / total rows * scale

    // an interval with only jacks of 11112222 has no completed seq
    // the clamp should catch that scenario
    // otherwise assume conditions which continue chains are in chains
    const taps_in_any_sequence = clamp(
      base_types[base_type.base_single_single]! +
        base_types[base_type.base_single_jump]! +
        base_types[base_type.base_jump_single]!,
      1,
      Math.max(1, this.max_total_len),
    );
    const tapsF = taps_in_any_sequence;

    // 11[12]22
    const csF = this.max_chain_swaps;
    // 11[12]11
    // auto cnF = static_cast<float>(max_not_swaps);
    // 111[12]222 = 1[12]2[12]1[12]2
    const clF = this.max_total_len;
    // 1[12]2[12]1[12]2 = small number < 11111111111[12]2222
    const caF = this.max_anchor_len;

    // anchor_len_weight should be [0,1]
    // 1 -> worth = entire chain length
    // 0 -> worth = longest anchor length
    const anchor_len_worth = weighted_average(
      clF,
      caF,
      this.anchor_len_weight,
      1.0,
    );

    const anchor_worth = fastsqrt(anchor_len_worth / tapsF) * this.len_scaler;
    const swap_worth = fastsqrt(csF / tapsF) * this.swap_scaler;
    // auto not_swap_worth = fastsqrt(cnF / tapsF) * not_swap_scaler;
    this.pmod = clamp(
      this.base + anchor_worth + swap_worth + this.not_swap_scaler,
      this.min_mod,
      this.max_mod,
    );
  }

  operator(mitvhi: metaItvHandInfo): number {
    this.set_pmod(mitvhi);

    this.interval_end();
    return this.pmod;
  }

  interval_end(): void {
    // reset any interval stuff here
    this.chain.reset_max_seq();
    this.max_chain_swaps = 0;
    this.max_not_swaps = 0;
    this.max_total_len = 0;
    this.max_anchor_len = 0;
  }
}
