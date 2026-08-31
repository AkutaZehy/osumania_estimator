// Port of Etterna 0.72.3 MetaIntervalInfo.h

import { ItvInfo } from "./IntervalInfo.js";

/**
 * Meta info for the interval, to describe patterning using consecutive
 * noterows. remember this is hand _agnostic_ meaning it operates fully on
 * note info, and needs no derived column logic
 */
export class metaItvInfo {
  _itvi = new ItvInfo();

  _idx = 0;
  // meta info for this interval extracted from the base noterow progression
  seriously_not_js = 0;
  definitely_not_jacks = 0;
  actual_jacks = 0;
  actual_jacks_cj = 0;
  not_js = 0;
  not_hs = 0;
  zwop = 0;
  shared_chord_jacks = 0;
  dunk_it = false;

  // ok new plan instead of a map, keep an array of 3, run a comparison loop
  // that sets 0s to a new value if that value doesn't match any non 0 value,
  // and set a bool flag if we have filled the array with unique values
  row_variations: number[] = [0, 0, 0];
  num_var = 0;
  // unique(noteinfos for interval) < 3, or row_variations[2] == 0 by interval
  // end
  basically_vibro = true;

  reset(): void {
    // at the moment this also resets to default
    this._itvi.handle_interval_end();

    this._idx = 0;
    this.seriously_not_js = 0;
    this.definitely_not_jacks = 0;
    this.actual_jacks = 0;
    this.actual_jacks_cj = 0;
    this.not_js = 0;
    this.not_hs = 0;
    this.zwop = 0;
    this.shared_chord_jacks = 0;
    this.dunk_it = false;

    this.row_variations.fill(0);
    this.num_var = 0;

    // upstream assigns 0 to the bool here
    this.basically_vibro = false;
  }

  handle_interval_end(): void {
    // isn't reset, preserve behavior. this essentially just tracks longer
    // sequences of single notes, we don't want it to be reset with
    // intervals, also there's probably a better way to implement this setup
    // seriously_not_js = 0;

    // alternating chordstream detected (used by cj only atm)
    this.definitely_not_jacks = 0;

    // number of shared jacks between to successive rows, used by js/hs to
    // depress jumpjacks
    this.actual_jacks = 0;

    // almost same thing as above (see comment in jack_scan)
    this.actual_jacks_cj = 0;

    // increased by detecting either long runs of single notes
    // (definitely_not_jacks > 3) or by encountering jumptrills, either
    // splithand or two hand, not_js and not_hs are the same thing, this
    // entire operation and setup should probably be split up and made more
    // explicit in each thing it detects and how those things are used
    this.not_js = 0;
    this.not_hs = 0;

    // recycle var for any int assignments
    this.zwop = 0;

    // self explanatory and unused atm
    this.shared_chord_jacks = 0;

    this.row_variations.fill(0);
    this.num_var = 0;

    // see def
    this.basically_vibro = true;
    this.dunk_it = false;

    // reset our interval info
    this._itvi.handle_interval_end();
  }
}
