// Port of Etterna 0.72.3 Dependent/CJOHASequencing.h

import { col_type, ms_init } from "../enums.js";
import { base_type } from "./HD_BasicSequencing.js";

/// multiply the time between previous jacks in the chain by this
/// if the gap is bigger than that, it is a new chain/anchor
export const chain_slowdown_scale_threshold = 1.99;

/** Looks for anchors and chains.
 * this:
 *
 * 01
 * 01
 * 11
 * 10
 * 10
 * 11
 * 01
 * 01 ...
 *
 * or
 * 01
 * 11
 * 11
 * 10 ...
 *
 * special case: also this
 * (not a chain!)
 * 01
 * 11
 * 11
 * 01 ...
 */
export class CJ_OHAnchor_Sequencer {
  chain_swaps = 0;
  not_swaps = 0;
  cur_len = 0;
  cur_anchor_len = 0;
  chain_swapping = false;

  max_chain_swaps = 0;
  max_not_swaps = 0;
  max_total_len = 0;
  max_anchor_len = 0;
  anchor_col: col_type = col_type.col_init;
  last_ms = ms_init;

  zero(): void {
    this.reset_max_seq();
    this.reset_seq();
    this.last_ms = ms_init;
  }

  reset_seq(): void {
    this.chain_swaps = 0;
    this.not_swaps = 0;
    this.cur_len = 0;
    this.cur_anchor_len = 0;

    this.chain_swapping = false;
    this.anchor_col = col_type.col_init;
    // not resetting ms time here
  }

  reset_max_seq(): void {
    this.max_chain_swaps = 0;
    this.max_not_swaps = 0;
    this.max_total_len = 0;
    this.max_anchor_len = 0;
  }

  update_max_seq(): void {
    this.max_chain_swaps = this.get_max_chain_swaps();
    this.max_not_swaps = this.get_max_not_swaps();
    this.max_total_len = this.get_max_total_len();
    this.max_anchor_len = this.get_max_anchor_len();
  }

  /// to reset the current chain and continue a new one
  complete_seq(): void {
    // if a chain swap was in progress
    // we ended on a jump -- the gap after was too big.
    // to capture the difficulty of the jump, fail a swap
    if (this.chain_swapping) {
      this.swap_failed();
    }

    // remove this check to consider 1111122222 a chain
    // otherwise, only 11111[12]22222 is a chain
    // and 11111[12]11111 also qualifies
    if (this.chain_swaps !== 0 || this.not_swaps !== 0) {
      this.update_max_seq();
    }

    // reset curr chain info
    this.reset_seq();
  }

  /// execute a chain swap. set longest anchor size, etc
  /// base pattern required for successful chain swap:
  /// 01
  /// 11
  /// 10
  chain_swap(): void {
    this.chain_swapping = false;
    this.max_anchor_len = this.get_max_anchor_len();
    this.cur_anchor_len = 0;
    this.chain_swaps++;
  }

  /// technically difficult repeat anchor-jumps
  /// base pattern:
  /// 01
  /// 11
  /// 01
  swap_failed(): void {
    this.chain_swapping = false;
    this.not_swaps++;
    // anchor continues ...
  }

  operator(
    ct: col_type,
    bt: base_type,
    last_ct: col_type,
    any_ms: number,
  ): void {
    if (this.last_ms * chain_slowdown_scale_threshold < any_ms) {
      // if the taps were too slow, reset
      this.complete_seq();
    }
    this.last_ms = any_ms;

    switch (bt) {
      case base_type.base_left_right:
      case base_type.base_right_left:
        // not a chain ...
        // not an anchor ...
        // end it
        this.complete_seq();
        break;
      case base_type.base_jump_jump:
        // allow [12][12] to continue a chain
        // anchor_col does not change
        this.cur_len++;
        this.cur_anchor_len++;

        // starting with jumps? no thanks
        if (this.anchor_col !== col_type.col_init) {
          this.chain_swapping = true;
        }
        break;
      case base_type.base_single_single:
        // consecutive 11 or 22
        // mid chain or about to chain
        this.anchor_col = ct;
        this.cur_len++;
        this.cur_anchor_len++;
        break;
      case base_type.base_single_jump:
        // 1[12] or 2[12]
        // chain expects a swap in columns
        // or may complete
        this.anchor_col = last_ct; // set to the column we used to be on
        this.cur_len++;
        this.chain_swapping = true;
        break;
      case base_type.base_jump_single:
        // [12]1 or [12]2
        // chain continuing
        this.cur_len++;
        this.cur_anchor_len++;

        if (
          (this.anchor_col === col_type.col_left &&
            ct === col_type.col_right) ||
          (this.anchor_col === col_type.col_right &&
            ct === col_type.col_left)
        ) {
          // valid to swap columns and continue

          // cope with swaps
          if (this.chain_swapping) {
            this.chain_swap();
          }
        } else {
          // anchor is continuing
          // jump was just ... a jump

          // was trying to swap but failed
          if (this.chain_swapping) {
            this.swap_failed();
          }
        }
        // this is currently the anchoring column
        this.anchor_col = ct;

        break;
      case base_type.base_type_init:
        // no info
        break;
      default:
        break;
    }
  }

  get_max_total_len(): number {
    return this.cur_len > this.max_total_len ? this.cur_len : this.max_total_len;
  }

  get_max_anchor_len(): number {
    return this.cur_anchor_len > this.max_anchor_len
      ? this.cur_anchor_len
      : this.max_anchor_len;
  }

  get_max_chain_swaps(): number {
    return this.chain_swaps > this.max_chain_swaps
      ? this.chain_swaps
      : this.max_chain_swaps;
  }

  get_max_not_swaps(): number {
    return this.not_swaps > this.max_not_swaps ? this.not_swaps : this.max_not_swaps;
  }
}
