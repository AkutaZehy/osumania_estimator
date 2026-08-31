// Port of Etterna 0.72.3 Dependent/RMSequencing.h

import { col_type, s_init } from "../enums.js";
import { base_type } from "./HD_BasicSequencing.js";
import { meta_type } from "./HD_MetaSequencing.js";
import { Anchor_Sequencing, anch_status } from "./GenericSequencing.js";
import { ms_from, ms_to_scaled_nps } from "../num.js";

// C++: static const float rma_diff_scaler = 1.06F * basescalers[Skill_Technical];
// (UlbuAcolytes.h basescalers[Skill_Technical] == 1.06)
export const rma_diff_scaler = 1.06 * 1.06;

/** Exact numeric layout of C++ `enum rm_behavior`. */
export const rm_behavior = {
  rmb_off_tap_oh: 0,
  rmb_off_tap_sh: 1,
  rmb_anchor: 2,
  rmb_jack: 3, // only for the anchor col, not any col
  rmb_init: 4,
} as const;
export type rm_behavior = (typeof rm_behavior)[keyof typeof rm_behavior];

/** Exact numeric layout of C++ `enum rm_status`. */
export const rm_status = {
  rm_inactive: 0,
  rm_running: 1,
} as const;
export type rm_status = (typeof rm_status)[keyof typeof rm_status];

/// Maintains the information pertaining to a single runningman.
/// This runningman is for one finger, so there are 4 of them.
/// The finger this is built for is the anchor finger.
export class RunningMan {
  /// all taps contained in this runningman sequence
  ran_taps = 0;

  /// total length of the anchor
  _len = 0;

  /// any off anchor taps
  off_taps = 0;
  off_len = 0;

  /// off anchor taps on the same hand, i.e. the 2s in 1211121
  off_taps_sh = 0;

  /// one hand trill taps
  oht_taps = 0;
  /// current oht sequence length
  oht_len = 0;

  /// it's not really a runningman if the anchor is on the off column is it
  ot_sh_len = 0;

  /// jack taps (like, actual jacks in the runningman)
  jack_taps = 0;
  jack_len = 0;

  /// consecutive anchors sequence length, track this to throw out 2h trills
  anch_len = 0;

  /// TS-only helper replicating the C++ implicit copy (value semantics).
  copy(): RunningMan {
    const c = new RunningMan();
    c.ran_taps = this.ran_taps;
    c._len = this._len;
    c.off_taps = this.off_taps;
    c.off_len = this.off_len;
    c.off_taps_sh = this.off_taps_sh;
    c.oht_taps = this.oht_taps;
    c.oht_len = this.oht_len;
    c.ot_sh_len = this.ot_sh_len;
    c.jack_taps = this.jack_taps;
    c.jack_len = this.jack_len;
    c.anch_len = this.anch_len;
    return c;
  }

  full_reset(): void {
    // don't touch anchor col
    this._len = 0;

    this.off_taps_sh = 0;

    this.off_taps = 0;
    this.off_len = 0;

    this.oht_taps = 0;
    this.oht_len = 0;

    this.jack_taps = 0;
    this.jack_len = 0;

    this.anch_len = 0;
  }

  add_off_tap_sh(): void {
    ++this.off_taps_sh;
    ++this.ot_sh_len;
    this.add_off_tap();
  }

  add_off_tap(): void {
    ++this.off_len;
    ++this.off_taps;
    ++this.ran_taps;
  }

  add_oht_tap(): void {
    ++this.oht_len;
    ++this.oht_taps;
  }

  add_anchor_tap(): void {
    ++this._len;
    ++this.anch_len;
    ++this.ran_taps;
  }

  add_jack_tap(): void {
    ++this.jack_len;
    ++this.jack_taps;
    ++this.ran_taps;
  }

  end_jack_and_anch_runs(): void {
    this.end_anch_run();
    this.end_jack_run();
  }

  end_anch_run(): void {
    this.anch_len = 0;
  }

  end_jack_run(): void {
    this.jack_len = 0;
  }

  end_off_tap_run(): void {
    this.off_len = 0;
    this.ot_sh_len = 0;
  }

  restart(): void {
    /* we will probably be resetting much more than we are restarting, so to
     * reduce computational expense, only set any values back to 0 while
     * sequencing after a restart, and remove the old restart function and
     * replace it with an inactive status. this is the old reset block,
     * minus _len, ran_taps, and time, those are set above because they are
     * already known */

    this.off_taps_sh = 0;
    this.off_taps = 0;
    this.off_len = 0;

    this.oht_taps = 0;
    this.oht_len = 0;

    this.jack_taps = 0;
    this.jack_len = 0;

    this.anch_len = 0;
  }

  /// any off taps to anchor len
  get_off_tap_prop(): number {
    if (this.off_taps === 0) return 0.0;

    return this._len / this.off_taps;
  }

  /// off hand taps to anchor len
  get_offhand_tap_prop(): number {
    if (this.off_taps - this.off_taps_sh <= 0) return 0.0;

    return (this.off_taps - this.off_taps_sh) / this._len;
  }

  /// same hand taps to anchor len
  get_off_tap_same_prop(): number {
    if (this.off_taps_sh === 0) return 0.0;

    return this.off_taps_sh / this._len;
  }
}

/// used by ranmen mod, for ranmen sequencing (doesn't have a sequence struct and
/// probably should?? this should just be logic only)
export class RM_Sequencer {
  // params.. loaded by runningman and then set from there
  max_oht_len = 0;
  max_off_len = 0;
  max_ot_sh_len = 0;
  max_burst_len = 0;
  max_jack_len = 0;

  // end with same hand off anchor taps, this is so 2h trills don't get
  // flagged as runningmen
  max_anchor_len = 0;

  set_params(
    moht: number,
    moff: number,
    motsh: number,
    mburst: number,
    mjack: number,
    manch: number,
  ): void {
    this.max_oht_len = Math.trunc(moht);
    this.max_off_len = Math.trunc(moff);
    this.max_ot_sh_len = Math.trunc(motsh);
    this.max_burst_len = Math.trunc(mburst);
    this.max_jack_len = Math.trunc(mjack);
    this.max_anchor_len = Math.trunc(manch);
  }

  _ct: col_type = col_type.col_init;
  _status: rm_status = rm_status.rm_inactive;
  _rmb: rm_behavior = rm_behavior.rmb_init;
  _last_rmb: rm_behavior = rm_behavior.rmb_init;

  _rm = new RunningMan();

  // try to allow 1 burst?
  is_bursting = false;
  had_burst = false;

  last_anchor_time = s_init;
  _start = s_init;

  /// TS-only helper replicating the C++ implicit copy constructor: C++
  /// returns RM_Sequencer by value from get_active_rm_with_higher_difficulty.
  copy(): RM_Sequencer {
    const c = new RM_Sequencer();
    c.max_oht_len = this.max_oht_len;
    c.max_off_len = this.max_off_len;
    c.max_ot_sh_len = this.max_ot_sh_len;
    c.max_burst_len = this.max_burst_len;
    c.max_jack_len = this.max_jack_len;
    c.max_anchor_len = this.max_anchor_len;
    c._ct = this._ct;
    c._status = this._status;
    c._rmb = this._rmb;
    c._last_rmb = this._last_rmb;
    c._rm = this._rm.copy();
    c.is_bursting = this.is_bursting;
    c.had_burst = this.had_burst;
    c.last_anchor_time = this.last_anchor_time;
    c._start = this._start;
    return c;
  }

  full_reset(): void {
    // don't touch anchor col

    this._status = rm_status.rm_inactive;
    this._rmb = rm_behavior.rmb_init;
    this._last_rmb = rm_behavior.rmb_init;

    this._start = s_init;
    this.last_anchor_time = s_init;

    this.is_bursting = false;
    this.had_burst = false;

    this._rm.full_reset();
  }

  /* restart only if we have just reset and there is a valid last rm_behavior
   * to start from. this is so we don't restart a runningman sequence
   * preceeded by pure jacks, (though there is some question about allowing
   * for only a single jack to start a new sequence, and how to handle doing
   * so). since restarting means we already have an anchor length of 2 (see
   * anchor sequencer) we can check for offtaps same hand, or offhand taps as
   * the last behavior to allow restarting. for the moment only
   * offtaps_samehand will be allowed to restart */
  restart(as: Anchor_Sequencing): void {
    /* we are restarting the runningman sequence because the anchor sequence
     * has reset and our last update was a same hand off tap, or because we
     * were inactive, had a same hand off tap last update, and are now on
     * the anchor col. as._last is the last seen col of the anchor, since we
     * can only restart when we're on an anchor col, the anchor col should
     * have already been updated and _last would be now, so calculate the
     * start time from as._sc_ms */
    this._start = as._last - as._sc_ms / 1000.0;

    // should always be equivalent to NOW,
    this.last_anchor_time = as._last;

    this._rm._len = 2;

    // technically if we are restarting we know we have 3 taps, but let
    // last_rmb handling take care of the third for clarity
    this._rm.ran_taps = 2;

    /* we will probably be resetting much more than we are restarting, so to
     * reduce computational expense, only set any values back to 0 while
     * sequencing after a restart, and remove the old restart function and
     * replace it with an inactive status. this is the old reset block,
     * minus _len, ran_taps, and time, those are set above because they are
     * already known */

    {
      this.is_bursting = false;
      this.had_burst = false;
      this._rm.restart();
    }

    // retroactively handle whatever behavior allowed the restart
    this.handle_last_rmb();
  }

  should_restart(): boolean {
    return this._last_rmb === rm_behavior.rmb_off_tap_sh;
  }

  end_off_tap_run(): void {
    // allow only 1 burst
    if (this.is_bursting) {
      this.is_bursting = false;
      this.had_burst = true;
    }
    // reset off_len counter
    this._rm.end_off_tap_run();
  }

  // optimization for restarting that skips max len checks
  handle_last_rmb(): void {
    // only viable start/restart mechanisms for now
    switch (this._last_rmb) {
      // ok this is jank af but if rmb_anchor is _last_rmb when restarting
      // it means we've started up again from the initial start logic, and
      // so we are _on_ rmb_off_tap_sh, so let this fall through
      case rm_behavior.rmb_off_tap_sh:
        this._rm.add_off_tap_sh();
        break;
      default:
        break;
    }
  }

  off_len_exceeds_max(): boolean {
    // haven't exceeded anything
    if (this._rm.off_len <= this.max_off_len) {
      return false;
    }

    // already had a burst and exceeding normal limit or exceeded the burst
    // limit
    if (this.had_burst || this._rm.off_len > this.max_burst_len) {
      return true;
    }

    // have exceeded the normal limit but not had a burst yet, set
    // bursting to true and return false
    this.is_bursting = true;
    return false;
  }

  ot_sh_len_exceeds_max(): boolean {
    return this._rm.ot_sh_len > this.max_ot_sh_len;
  }

  jack_len_exceeds_max(): boolean {
    return this._rm.jack_len > this.max_jack_len;
  }

  anch_len_exceeds_max(): boolean {
    return this._rm.anch_len > this.max_anchor_len;
  }

  oht_len_exceeds_max(): boolean {
    return this._rm.oht_len > this.max_oht_len;
  }

  // executed if incoming ct == _ct
  handle_anchor_behavior(as: Anchor_Sequencing): void {
    // handle anchor logic here

    // too long since we saw an off anchor same hand tap.. it's probably a
    // trill or something
    if (this.anch_len_exceeds_max()) {
      this._status = rm_status.rm_inactive;
      return;
    }

    switch (as._status) {
      case anch_status.reset_too_slow:
      case anch_status.reset_too_fast:
        // anchor has changed speeds to a significant degree,
        // restart if we are able to, otherwise flag the runningman
        // as inactive
        if (this.should_restart()) {
          this.restart(as);
        } else {
          this._status = rm_status.rm_inactive;
        }
        break;
      case anch_status.anchoring:
        this._rm.add_anchor_tap();
        this._rm.end_off_tap_run();
        // (the C++ falls through into the empty case anch_init here)
        break;
      case anch_status.anch_init:
        // do nothing
        break;
    }
  }

  handle_off_tap_sh_behavior(): void {
    // add before running length checks
    this._rm.add_off_tap_sh();
    if (this.off_len_exceeds_max() || this.ot_sh_len_exceeds_max()) {
      // don't reset anything, just flag as inactive
      this._status = rm_status.rm_inactive;
    } else {
      // we have an offanchor tap on the same hand, end any jack or
      // consecutive anchor sequences
      this._rm.end_jack_and_anch_runs();
    }
  }

  handle_off_tap_oh_behavior(): void {
    this._rm.add_off_tap();
    if (this.off_len_exceeds_max()) {
      this._status = rm_status.rm_inactive;
    } else {
      // we have an offanchor tap on the other hand, end any jack run, but
      // not an anchor run, those should only be broken by same hand taps
      this._rm.end_jack_run();
    }
  }

  handle_jack_behavior(): void {
    this._rm.add_jack_tap();
    if (this.jack_len_exceeds_max()) {
      this._status = rm_status.rm_inactive;
    } else {
      this.end_off_tap_run();
    }
  }

  /* oht's are a subtype of off_tap_sh, and the behavior will just fall
   * through to the latter's, so don't do anything outside of oht values
   * or reset anything, it'll be redundant at best and bug prone at worst
   */
  handle_oht_behavior(ct: col_type): void {
    /* to be explicit about the goal here, given 111212111 any reasonable
     * player would conclude there was a 4 note oht in the middle of a
     * runningman, and while rare (because it's hard as shit) it's
     * acceptable, the same thing applies to a 6 note oht inside a
     * runningman, though those are even rarer, however what we care about
     * is the threshold at which this can be jumpjacked, which is about 8
     * oht taps total, dependent on speed (this is already pretty generous
     * and i don't want to handle diffrential speeds here). now since a 7
     * note ohtrill in the context of a runningman is meaningless (think
     * about it) we only really care about the number of consecutive
     * off_taps_sh */

    if (ct !== this._ct) {
      /* metatype won't be set until it finds 1212, but we want to
       * explicitly track the number of off_anchor taps in the oht, so
       * boost by 1 when we see meta_oht and oht_len == 0 */
      if (this._rm.oht_len === 0) {
        this._rm.add_oht_tap();
      }

      this._rm.add_oht_tap();
      if (this.oht_len_exceeds_max()) {
        this._status = rm_status.rm_inactive;
      }
    }
  }

  handle_rmb(as: Anchor_Sequencing): void {
    switch (this._rmb) {
      case rm_behavior.rmb_off_tap_oh:
        // should only ever be called from advance_off_hand_sequencing
        break;
      case rm_behavior.rmb_off_tap_sh:
        this.handle_off_tap_sh_behavior();
        break;
      case rm_behavior.rmb_anchor:
        this.handle_anchor_behavior(as);
        break;
      case rm_behavior.rmb_jack:
        this.handle_jack_behavior();
        break;
      default:
        break;
    }
  }

  /* rm_sequencing is the only hand dependent mod atm that actually cares
   * about basic off_hand information, so this should be called to update
   * using that information before the ct == col_empty continue block in ulbu.
   */
  advance_off_hand_sequencing(): void {
    this.handle_off_tap_oh_behavior();
    this._last_rmb = rm_behavior.rmb_off_tap_oh;
  }

  operator(ct: col_type, bt: base_type, mt: meta_type, as: Anchor_Sequencing): void {
    /* cosmic brain handling of ohts, this won't interfere with the
     * determinations in the behavior block, but it can set rm_inactive (as
     * it should be able to) */
    if (mt === meta_type.meta_cccccc) {
      this.handle_oht_behavior(ct);
    }

    /* update our last anchor time , we don't handle this in the anchoring
     * block because technically jacks can either be on the anchor column or
     * not, and i don't want to have to split logic again between anchor
     * column jacks and off anchor jacks on the same hand */
    this.last_anchor_time = as._last;

    // if anchor_sequencing passes forward s_init, reset everything
    // this means the rm for this finger should definitely be dead
    // (nuclear bandaid, probably just want to set status to inactive)
    if (this.last_anchor_time === s_init) {
      this.full_reset();
      return;
    }

    // determine what we should do
    switch (bt) {
      case base_type.base_left_right:
      case base_type.base_right_left:
      case base_type.base_single_single:
        if (this._ct === ct) {
          // this is an anchor
          this._rmb = rm_behavior.rmb_anchor;
        } else {
          // this is a same hand off anchor tap
          this._rmb = rm_behavior.rmb_off_tap_sh;
        }
        break;
      case base_type.base_jump_single:
        if (this._last_rmb === rm_behavior.rmb_off_tap_oh) {
          // if we have a jump -> single, and the last note was an
          // offhand tap, and the single is the anchor col, then
          // we have an anchor
          if (this._ct === ct) {
            this._rmb = rm_behavior.rmb_anchor;
          } else {
            // this is a same hand off anchor tap
            this._rmb = rm_behavior.rmb_off_tap_sh;
          }
        } else {
          // if we are jump -> single and the last note was _not_
          // an offhand hand tap, we have a jack
          this._rmb = rm_behavior.rmb_jack;
        }
        break;
      case base_type.base_single_jump:
      case base_type.base_jump_jump:
        // if last note was an offhand tap, this is by
        // definition part of the anchor
        if (this._last_rmb === rm_behavior.rmb_off_tap_oh) {
          this._rmb = rm_behavior.rmb_anchor;
        } else {
          // if not, a jack
          this._rmb = rm_behavior.rmb_jack;
        }
        break;
      case base_type.base_type_init:
        // bail and don't set anything
        return;
      default:
        break;
    }

    /* only allow same hand off taps after an anchor to begin a runningman
     * sequence for now, this means we are rm_inactive, we are currently
     * using behavior _rmb_off_tap_sh, and _last_rmb was rmb_anchor */
    if (this._status === rm_status.rm_inactive) {
      if (this._rmb === rm_behavior.rmb_anchor && this._last_rmb === rm_behavior.rmb_off_tap_sh) {
        // ok we can start
        this._status = rm_status.rm_running;
        this.restart(as);
      }
    } else {
      // if we're not inactive, just do normal behavior
      this.handle_rmb(as);
    }

    // remember what we did last
    this._last_rmb = this._rmb;
  }

  get_difficulty(): number {
    if (this._status === rm_status.rm_inactive || this._rm._len < 3) {
      return 1.0;
    }

    const flool = ms_from(this.last_anchor_time, this._start);

    const len = this._rm._len;
    const len_1 = this._rm._len - 1;

    const pule = (flool / len_1) * (len / len_1);
    const drool = ms_to_scaled_nps(pule) * rma_diff_scaler;
    return drool;
  }
}
