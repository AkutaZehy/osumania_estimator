// Port of Etterna 0.72.3 Dependent/GenericSequencing.h

import { col_type, ms_init, s_init } from "../enums.js";
import {
  ct_loop_no_jumps,
  invert_col,
} from "./HD_BasicSequencing.js";
import { ms_from } from "../num.js";
import { CalcMovingWindow } from "../window.js";

/* Contains generic sequencers passed to metahandinfo to be advanced in the row
 * loop */

// ok this has expanded into more than i bargained for an should be
// appropriately renamed and commented when i figure out what it is

/* important note about timing names used throughout the calc. anything being
 * updated with the ms value of this row to the last row with a note in it
 * independent of any other considerations should use the var name "any_ms", the
 * name of the ms value from the current row to the last row that contains a
 * note on the same column should be "sc_ms", for same column ms, and the only
 * other option is "cc_ms", for cross column ms */

/****** Relevant to anchors ******/
export const anchor_spacing_buffer_ms = 10.0;
export const anchor_speed_increase_cutoff_factor = 2.34;
export const anchor_len_cap = 50;

/****** Relevant to jacks ******/
export const jack_spacing_buffer_ms = 10.0;
export const jack_speed_increase_cutoff_factor = 1.9;
export const jack_len_cap = 4;

/// ms to pass that definitely means an anchor has finished and started a new one
export const guaranteed_reset_buffer_ms = 1000.0;

/** Exact numeric layout of C++ `enum anch_status`. */
export const anch_status = {
  reset_too_slow: 0,
  reset_too_fast: 1,

  // _len > 2, otherwise we would be at the start of a file, or just reset due
  // to being too fast/slow
  anchoring: 2,
  anch_init: 3,
} as const;
export type anch_status = (typeof anch_status)[keyof typeof anch_status];

/// Individual anchors, 2 objects per hand on 4k.
export abstract class Finger_Sequencing {
  // what column this anchor is on (will be set on startup by the sequencer)
  _ct: col_type = col_type.col_init;
  _status: anch_status = anch_status.anch_init;

  /** note: aside from the first note, _len is always at least 2.
   * outside of note 1 we are always in a 2 note anchor of some description.
   * given 50, 500, 50, (4 notes), we have 2 notes, 1 and 2, 50 ms apart, and
   * we are in an anchor. the 500 ms then breaks it due to being too much
   * slower and starts a new anchor with notes 2 and 3, a 500 ms anchor. then
   * the same thing happens again on reaching note 4, where the 50 breaks the
   * 500 anchor due to being too fast, and again starts a new sequence with
   * 3-4, this may seem like needless quibbling but if we are using anchor
   * sequencing as the base for jack difficulty we want to ensure that cutoff
   * points are reasonable, and that any point may be queried for a jack
   * difficulty regardless of whether or not a human would consider it to be a
   * jack
   */
  _len = 1;
  /// same-column ms: time between now and previous tap
  _sc_ms = ms_init;

  /// highest ms value found in the anchor.
  /// if we exceed this + buffer, break the anchor sequence
  _max_ms = ms_init;

  /// rather than a buffer cap maybe a len cap will be more scalable, track the
  /// difficulty at the cap and when queried beyond it, just return this value
  _len_cap_ms = ms_init;

  /// row_time of last note on this col
  _last = s_init;
  _start = s_init;

  full_reset(): void {
    // never reset col_type
    this._sc_ms = ms_init;
    this._max_ms = ms_init;
    this._last = s_init;
    this._start = s_init;
    this._len = 1;
    this._status = anch_status.anch_init;
    this._len_cap_ms = ms_init;
  }

  /// based on the anchoring status, do an action
  check_status(): void {
    switch (this._status) {
      case anch_status.reset_too_slow:
      case anch_status.reset_too_fast:
        /* i don't like hard cutoffs much but in the interest of
         * fairness if the current ms value is vastly lower than the
         * _max_ms, set the start time of the anchor to now and reset, i
         * can't really think of any way this can be abused in a way
         * that inflates files, just lots of ways it can underdetect;
         * we're resetting because we've started on something much
         * faster or slower, so we know the start of this anchor was
         * actually the, last note, directly reset _max_ms to the
         * current ms and len to 2 */
        this._start = this._last;
        this._len = 2;
        break;
      case anch_status.anchoring:
        // increase anchor length and set new cutoff point
        ++this._len;
        break;
      case anch_status.anch_init:
        // nothing to do
        break;
    }
  }

  /** Set the status of this anchor.
   * Break the anchor if the next note is too much slower than the lowest
   * one in the sequence. Remember, if we reset, the start of the new
   * anchor was the last row_time, and the new max_ms should be the
   * current ms value.
   */
  abstract set_status(): void;
  /// sequence updating given the column type and time of current row
  abstract operator(ct: col_type, now: number): void;
  /// returns an adjusted MS average value, not converted to nps
  abstract get_ms(): number;
}

/// Individual jacks, rather than anchors, with more nuance.
export class Jack_Sequencing extends Finger_Sequencing {
  set_status(): void {
    if (this._sc_ms > this._max_ms + jack_spacing_buffer_ms) {
      this._status = anch_status.reset_too_slow;
    } else if (this._sc_ms * jack_speed_increase_cutoff_factor < this._max_ms) {
      this._status = anch_status.reset_too_fast;
    } else {
      this._status = anch_status.anchoring;
    }
  }

  operator(ct: col_type, now: number): void {
    this._sc_ms = ms_from(now, this._last);

    if (ct === col_type.col_init) {
      this._last = now;
      return;
    }

    this.set_status();
    this.check_status();

    this._max_ms = this._sc_ms;
    this._last = now;
  }

  /// returns an adjusted MS average value, not converted to nps
  get_ms(): number {
    /* return whatever the last calculated value was after this point, this
     * way we don't let longjacks completely take over */
    if (this._len > jack_len_cap) {
      return this._len_cap_ms;
    }

    const avg_ms_mult = 1.5;
    const anchor_time_buffer_ms = 30.0;
    const min_ms = 95.0;

    // get total ms
    const total_ms = ms_from(this._last, this._start);

    // get len (len of 2 (notes) means 1 jack, 3 = 2, etc
    const len = this._len - 1;

    // get average ms for the jack sequence
    const avg_ms = total_ms / len;

    /* adjust total ms by adding flat and scaled buffers, this depresses
     * shorter jacks more */
    const adj_total_ms =
      total_ms + anchor_time_buffer_ms + avg_ms * avg_ms_mult;

    // calculate final adjusted ms average
    let ms = adj_total_ms / len;

    // BAD TEMP HACK LUL
    if (this._len === 2) {
      ms *= 1.1;
      ms = ms < 180.0 ? 180.0 : ms;
    }

    ms = ms < min_ms ? min_ms : ms;

    if (Number.isNaN(ms)) ms = this._max_ms;

    if (this._len === jack_len_cap) {
      this._len_cap_ms = ms;
    }

    return ms;
  }
}

/** Anchors; effectively the same as jacks, but handled slightly differently.
 * If you are struggling with the notion that a 300 bpm oht is considered 2
 * anchors of roughly equivalent lengths (depending on where you sample) and
 * equivalent times, the difference between an anchor and a jack is that one
 * cares about the existence of notes on other columns while the other doesn't,
 * as in, it would make far less sense to call them jacks
 */
export class Anchor_Sequencing extends Finger_Sequencing {
  set_status(): void {
    if (this._sc_ms > this._max_ms + anchor_spacing_buffer_ms) {
      this._status = anch_status.reset_too_slow;
    } else if (
      this._sc_ms * anchor_speed_increase_cutoff_factor < this._max_ms
    ) {
      this._status = anch_status.reset_too_fast;
    } else {
      this._status = anch_status.anchoring;
    }
  }

  operator(ct: col_type, now: number): void {
    this._sc_ms = ms_from(now, this._last);

    if (ct === col_type.col_init) {
      this._last = now;
      return;
    }

    this.set_status();
    this.check_status();

    this._max_ms = this._sc_ms;
    this._last = now;
  }

  /// returns an adjusted MS average value, not converted to nps
  /// (((currently unused)))
  get_ms(): number {
    /* return whatever the last calculated value was after this point, this
     * way we don't let longjacks completely take over */
    if (this._len > anchor_len_cap) {
      return this._len_cap_ms;
    }

    const avg_ms_mult = 1.0;
    const anchor_time_buffer_ms = 0.0;
    const min_ms = 0.0;

    // get total ms
    const total_ms = ms_from(this._last, this._start);

    // get len (len of 2 (notes) means 1 jack, 3 = 2, etc
    const len = this._len - 1;

    // get average ms for the jack sequence
    const avg_ms = total_ms / len;

    /* adjust total ms by adding flat and scaled buffers, this depresses
     * shorter jacks more */
    const adj_total_ms =
      total_ms + anchor_time_buffer_ms + avg_ms * avg_ms_mult;

    // calculate final adjusted ms average
    let ms = adj_total_ms / len;

    // BAD TEMP HACK LUL
    if (this._len === 2) {
      ms *= 1.1;
      ms = ms < 155.0 ? 155.0 : ms;
    }

    ms = ms < min_ms ? min_ms : ms;

    if (Number.isNaN(ms)) ms = this._max_ms;

    if (this._len === anchor_len_cap) {
      this._len_cap_ms = ms;
    }

    return ms;
  }
}

// CURRENTLY ALSO BEING USED TO STORE THE OLD CC/TC MS VALUES IN MHI...
// not that this is a great idea but it's appropriate for doing so
export class AnchorSequencer {
  /// anchor sequencers for each finger
  // C++: std::array<std::unique_ptr<Anchor_Sequencing>, num_cols_per_hand>
  anch: Anchor_Sequencing[] = [new Anchor_Sequencing(), new Anchor_Sequencing()];
  /// jack sequencers for each finger
  // C++: std::array<std::unique_ptr<Jack_Sequencing>, num_cols_per_hand>
  jack: Jack_Sequencing[] = [new Jack_Sequencing(), new Jack_Sequencing()];

  /// information for each column to store in the movingwindow_max, this interval
  // C++: std::array<int, num_cols_per_hand> max_seen = { 0, 0 };
  max_seen: number[] = [0, 0];
  /// track windows of highest anchor per col seen during an interval
  // C++: std::array<CalcMovingWindow<int>, num_cols_per_hand> _mw_max;
  _mw_max: CalcMovingWindow<number>[] = [
    new CalcMovingWindow<number>(),
    new CalcMovingWindow<number>(),
  ];

  constructor() {
    for (const c of ct_loop_no_jumps) {
      this.anch[c]!._ct = c;
      this.jack[c]!._ct = c;
    }
    this.full_reset();
  }

  full_reset(): void {
    this.max_seen.fill(0);

    for (const c of ct_loop_no_jumps) {
      this.anch[c]!.full_reset();
      this.jack[c]!.full_reset();
      this._mw_max[c]!.zero();
    }
  }

  // derives sc_ms, which sequencer general will pull for its moving window
  operator(ct: col_type, row_time: number): void {
    // update the one
    if (ct === col_type.col_left || ct === col_type.col_right) {
      const opposite_col =
        ct === col_type.col_left ? col_type.col_right : col_type.col_left;
      this.anch[ct]!.operator(ct, row_time);
      this.jack[ct]!.operator(ct, row_time);

      // set max seen for this col for this interval
      this.max_seen[ct] =
        this.anch[ct]!._len > this.max_seen[ct]!
          ? this.anch[ct]!._len
          : this.max_seen[ct]!;

      // reset the other column if necessary
      // this is particularly for jacks -- not resetting this breaks
      // difficulty
      if (
        ms_from(row_time, this.anch[opposite_col]!._last) >
        guaranteed_reset_buffer_ms
      ) {
        this.anch[opposite_col]!.full_reset();
        this.jack[opposite_col]!.full_reset();
      }
    } else if (ct === col_type.col_ohjump) {
      // update both
      for (const c of ct_loop_no_jumps) {
        this.anch[c]!.operator(c, row_time);
        this.jack[c]!.operator(c, row_time);

        // set max seen
        this.max_seen[c] =
          this.anch[c]!._len > this.max_seen[c]!
            ? this.anch[c]!._len
            : this.max_seen[c]!;
      }
    }
  }

  // returns max anchor length seen for the requested window
  get_max_for_window_and_col(ct: col_type, window: number): number {
    return this._mw_max[ct]!.get_max_for_window(window);
  }

  interval_end(): void {
    for (const c of ct_loop_no_jumps) {
      this._mw_max[c]!.operator(this.max_seen[c]!);
      this.max_seen[c] = 0;
    }
  }

  get_lowest_jack_ms(): number {
    return Math.min(
      this.jack[col_type.col_left]!.get_ms(),
      this.jack[col_type.col_right]!.get_ms(),
    );
  }
}

/* keep timing stuff here instead of in mhi, use mhi exclusively for pattern
 * detection */

/* every note has at least 2 ms values associated with it, the ms value from
 * the last cross column note (on the same hand), and the ms value from the last
 * note on it's/this column both are useful for different things, and we want to
 * track both for ohjumps, we will track the ms from the last non-jump on either
 * finger, there are situations where we may want to consider jumps as having a
 * cross column ms value of 0 with itself, not sure if they should be set to
 * this or left at the init values of 5000 though */

// more stuff could/should be moved here? the only major issue with moving _all_
// sequencers here is loading/setting their params
export class SequencerGeneral {
  /* should maybe have this contain a struct that just handles timing, or is
   * that overboard? */

  /// moving window of ms_any values, practically speaking, row with something
  /// in it on this hand to last row with something in it on the current hand
  _mw_any_ms = new CalcMovingWindow<number>();

  /// moving window of cc_ms values
  _mw_cc_ms = new CalcMovingWindow<number>();

  /// moving window of sc_ms values, not used but we will probably want
  /// eventually (maybe? maybe move it? idk???)
  // C++: std::array<CalcMovingWindow<float>, num_cols_per_hand>
  _mw_sc_ms: CalcMovingWindow<number>[] = [
    new CalcMovingWindow<number>(),
    new CalcMovingWindow<number>(),
  ];

  /** basic sequencers */
  _as = new AnchorSequencer();

  /// sc_ms is the time from the current note to the last note in the same
  /// column, we've already updated the anchor sequencer and it will already
  /// contain that value in _sc_ms
  set_sc_ms(ct: col_type): void {
    // single notes are simple
    if (ct === col_type.col_left || ct === col_type.col_right) {
      this._mw_sc_ms[ct]!.operator(this._as.anch[ct]!._sc_ms);
    }

    // oh jumps mean we do both, we will allow whatever is querying for the
    // value to choose which column value they want (lower by default)
    if (ct === col_type.col_ohjump) {
      for (const c of ct_loop_no_jumps) {
        this._mw_sc_ms[c]!.operator(this._as.anch[c]!._sc_ms);
      }
    }
  }

  // cc_ms is the time from the current note to the last note in the cross
  // column, for this we need to take the last row_time on the cross column,
  // (anchor sequencer has it as _last) and derive a new ms value from it and
  // the current row_time
  set_cc_ms(ct: col_type, row_time: number): void {
    // single notes are simple, grab the _last of ct inverted
    if (ct === col_type.col_left || ct === col_type.col_right) {
      this._mw_cc_ms.operator(
        ms_from(row_time, this._as.anch[invert_col(ct)]!._last),
      );
    }

    /* jumps are tricky, technically we have 2 cc_ms values, but also
     * technically values are simply the sc_ms values we already calculated,
     * but inverted, given that the goal however is to provide general
     * values that various pattern mods can use such that they don't have to
     * all track their own custom sequences, we should place the lower sc_ms
     * value in here, since that's the most common use case, if something
     * needs to specifically handle ohjumps differently, it can do so we do
     * actually need to set this value so the calcwindow internal cv checks
     * will work, we can't just shortcut and make a get function which swaps
     * where it returns from */
    if (ct === col_type.col_ohjump) {
      this._mw_cc_ms.operator(this.get_sc_ms_now(col_type.col_ohjump));
    }
  }

  // stuff
  advance_sequencing(ct: col_type, row_time: number, ms_now: number): void {
    if (ct !== col_type.col_ohjump) {
      const reset_sequencer =
        ms_from(row_time, this._as.anch[ct]!._last) >
        guaranteed_reset_buffer_ms;
      if (reset_sequencer) {
        this._as.anch[ct]!.full_reset();
        this._as.jack[ct]!.full_reset();
        this._mw_sc_ms[ct]!.fill(ms_init);
        this._mw_cc_ms.fill(ms_init);
        this._mw_any_ms.fill(ms_init);
      }
    }

    // update sequencers
    this._as.operator(ct, row_time);

    // i guess we keep track of ms sequencing here instead of mhi, or
    // somewhere new?

    // sc ms needs to be set first, cc ms will reference it for ohjumps
    this.set_sc_ms(ct);
    this.set_cc_ms(ct, row_time);
    this._mw_any_ms.operator(ms_now);
  }

  get_sc_ms_now(ct: col_type, lower = true): number {
    if (ct === col_type.col_init) {
      return ms_init;
    }

    // if ohjump, grab the smaller value by default
    if (ct === col_type.col_ohjump) {
      if (lower) {
        return this._mw_sc_ms[col_type.col_left]!.get_now() <
            this._mw_sc_ms[col_type.col_right]!.get_now()
          ? this._mw_sc_ms[col_type.col_left]!.get_now()
          : this._mw_sc_ms[col_type.col_right]!.get_now();
      }
      // return the higher value instead (dunno if we'll ever need
      // this but it's good to have the option)
      return this._mw_sc_ms[col_type.col_left]!.get_now() >
          this._mw_sc_ms[col_type.col_right]!.get_now()
        ? this._mw_sc_ms[col_type.col_left]!.get_now()
        : this._mw_sc_ms[col_type.col_right]!.get_now();
    }

    // simple
    return this._mw_sc_ms[ct]!.get_now();
  }

  get_any_ms_now(): number {
    return this._mw_any_ms.get_now();
  }

  get_cc_ms_now(): number {
    return this._mw_cc_ms.get_now();
  }

  interval_end(): void {
    this._as.interval_end();
  }

  full_reset(): void {
    this._mw_any_ms.fill(ms_init);
    this._mw_cc_ms.fill(ms_init);

    for (const c of ct_loop_no_jumps) {
      this._mw_sc_ms[c]!.fill(ms_init);
    }

    this._as.full_reset();
  }
}
