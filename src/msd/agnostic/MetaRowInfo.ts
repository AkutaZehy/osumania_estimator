// Port of Etterna 0.72.3 MetaRowInfo.h

import { col_ids, ms_init, s_init } from "../enums.js";
import { column_count, ms_from } from "../num.js";
import {
  is_alternating_chord_single,
  is_alternating_chord_stream,
  is_jack_at_col,
} from "./HA_Sequencing.js";
import { metaItvInfo } from "./MetaIntervalInfo.js";

/** counterpart to metahandinfo */
export class metaRowInfo {
  static readonly dbg = false;
  static readonly dbg_lv2 = false;

  time = s_init;
  // time from last row (ms)
  ms_now = ms_init;
  count = 0;
  last_count = 0;
  last_last_count = 0;
  notes = 0;
  last_notes = 0;
  last_last_notes = 0;

  // per row bool flags, these must be directly set every row
  alternating_chordstream = false;
  alternating_chord_single = false;
  gluts_maybe = false; // not really used/tested yet
  twas_jack = false;

  reset(): void {
    this.time = s_init;
    this.ms_now = ms_init;
    this.count = 0;
    this.last_count = 0;
    this.last_last_count = 0;
    this.notes = 0;
    this.last_notes = 0;
    this.last_last_notes = 0;

    this.alternating_chordstream = false;
    this.alternating_chord_single = false;
    this.gluts_maybe = false;
    this.twas_jack = false;
  }

  set_row_variations(mitvi: metaItvInfo): void {
    // already determined there's enough variation in this interval
    if (!mitvi.basically_vibro) {
      return;
    }

    // trying to fill array with up to 3 unique row_note configurations
    for (let i = 0; i < mitvi.row_variations.length; ++i) {
      const t = mitvi.row_variations[i]!;
      // already a stored value here
      if (t !== 0) {
        // already have one of these
        if (t === this.notes) {
          return;
        }
      } else if (t === 0) {
        // nothing stored here and isn't a duplicate, store it and
        // iterate num_var
        mitvi.row_variations[i] = this.notes;
        ++mitvi.num_var;

        // check if we filled the array with unique values. since we
        // start by assuming anything is basically vibro, set the flag
        // to false if it is
        if (mitvi.row_variations[2] !== 0) {
          mitvi.basically_vibro = false;
        }
        return;
      }
    }
  }

  // scan for jacks and jack counts between this row and the last
  jack_scan(mitvi: metaItvInfo): void {
    this.twas_jack = false;

    for (const id of col_ids) {
      if (is_jack_at_col(id, this.notes, this.last_notes)) {
        // not scaled to the number of jacks anymore
        ++mitvi.actual_jacks;
        this.twas_jack = true;
        // try to pick up gluts maybe?
        if (this.count > 1 && column_count(this.last_notes) > 1) {
          ++mitvi.shared_chord_jacks;
        }
      }
    }

    // if we used the normal actual_jack for CJ too we're saying something
    // like "chordjacks" are harder if they share more columns from chord to
    // chord" which is not true, it is in fact either irrelevant or the
    // inverse depending on the scenario, this is merely to catch stuff like
    // splithand jumptrills registering as chordjacks when they shouldn't be
    if (this.twas_jack) {
      ++mitvi.actual_jacks_cj;
    }
  }

  basic_row_sequencing(last: metaRowInfo, mitvi: metaItvInfo): void {
    this.jack_scan(mitvi);
    this.set_row_variations(mitvi);

    // check if we have a bunch of stuff like [123]4[123] [12]3[124] which
    // isn't actually chordjack, its just broken hs/js, and in fact with the
    // level of leniency that is currently being applied to generic
    // proportions, lots of heavy js/hs is being counted as cj for their 2nd
    // rating, and by a close margin too, we can't just look for [123]4, we
    // need to finish the sequence to be sure i _think_ we only want to do
    // this for single notes, we could abstract it to a more generic pattern
    // template, but let's be restrictive for now
    this.alternating_chordstream = is_alternating_chord_stream(
      this.notes,
      this.last_notes,
      last.last_notes,
    );
    if (this.alternating_chordstream) {
      ++mitvi.definitely_not_jacks;
    }

    if (this.alternating_chordstream) {
      // put mixed density stuff here later
    }

    // only cares about single vs chord, not jacks
    this.alternating_chord_single = is_alternating_chord_single(
      this.count,
      last.count,
    );
    if (this.alternating_chord_single) {
      if (!this.twas_jack) {
        mitvi.seriously_not_js -= 3;
      }
    }

    if (last.count === 1 && this.count === 1) {
      mitvi.seriously_not_js =
        0 > mitvi.seriously_not_js ? 0 : mitvi.seriously_not_js;
      ++mitvi.seriously_not_js;

      // light js really stops at [12]321[23] kind of
      // density, anything below that should be picked up
      // by speed, and this stop rolls between jumps
      // getting floated up too high
      if (mitvi.seriously_not_js > 3) {
        mitvi.not_js += mitvi.seriously_not_js;
        // give light hs the light js treatment
        mitvi.not_hs += mitvi.seriously_not_js;
      }
    } else if (last.count > 1 && this.count > 1) {
      // suppress jumptrilly garbage a little bit
      mitvi.not_hs += this.count;
      mitvi.not_js += this.count;

      // might be overkill
      if ((this.notes & this.last_notes) === 0) {
        ++mitvi.not_hs;
        ++mitvi.not_js;
      } else {
        this.gluts_maybe = true;
      }
    }

    // if the previous 3 rows do not form any jacks
    // and the current and previous rows are chords
    if (
      (this.notes & this.last_notes) === 0 &&
      this.count > 1 &&
      this.last_count > 1
    ) {
      if ((this.last_notes & last.last_notes) === 0 && this.last_count > 1) {
        mitvi.dunk_it = true;
      }
    }
  }

  operator(
    last: metaRowInfo,
    mitvi: metaItvInfo,
    row_time: number,
    row_count: number,
    row_notes: number,
  ): void {
    this.time = row_time;
    this.last_last_count = last.last_count;
    this.last_count = last.count;
    this.count = row_count;

    this.last_last_notes = last.last_notes;
    this.last_notes = last.notes;
    this.notes = row_notes;

    this.ms_now = ms_from(this.time, last.time);

    mitvi._itvi.update_tap_counts(this.count);
    this.basic_row_sequencing(last, mitvi);
  }
}
