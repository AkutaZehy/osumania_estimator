// Port of Etterna 0.72.3 Dependent/MetaHandInfo.h

import { col_type } from "../enums.js";
import {
  base_type,
  determine_base_pattern_type,
} from "./HD_BasicSequencing.js";
import { determine_meta_type, meta_type } from "./HD_MetaSequencing.js";

/* this is a row by row sequencer that constructs basic and advanced hand based
 * patterns given noteinfo input for a current row, and its own output of the
 * last row */

// perhaps this should contain no timing information, only pattern information?

// potentially outdated comment below
// this should contain most everything needed for the generic pattern mods,
// extremely specific sequencing will take place in separate areas like with
// rm_sequencing, and widerange scalers should track their own interval queues
// metanoteinfo is generated per row, from current noteinfo and the previous
// metanoteinfo object, each metanoteinfo stores some basic information from
// the last object, allowing us to look back 3-4 rows into the past without
// having to explicitly store more than 2 mni objects, and we can recycle the
// pointers as we generate the info metanoteinfo is generated per _hand_, not
// per note or column. it contains the relevant information for determining
// what the column configuation of each hand is for any row, and it contains
// timestamp arrays for each column, so it is unnecessary to generate
// information per note, even though in some ways it might be more convenient
// or clearer
export class metaHandInfo {
  /// col
  _ct: col_type = col_type.col_init;
  _last_ct: col_type = col_type.col_init;

  /// type of cross column hit
  _bt: base_type = base_type.base_type_init;
  _last_bt: base_type = base_type.base_type_init;

  /// needed for the BIGGEST BRAIN PLAYS
  last_last_bt: base_type = base_type.base_type_init;

  // whomst've
  _mt: meta_type = meta_type.meta_type_init;
  _last_mt: meta_type = meta_type.meta_type_init;

  /// number of offhand taps before this row
  offhand_taps = 0;
  offhand_ohjumps = 0;

  /// we need to reset everything between hands or the trailing values from the
  /// end of one will carry over into the start of the other, not a huge
  /// practical deal but it could theoretically be abused and it's good
  /// practice to reset anyway
  full_reset(): void {
    this._ct = col_type.col_init;
    this._last_ct = col_type.col_init;

    this._bt = base_type.base_type_init;
    this._last_bt = base_type.base_type_init;
    this.last_last_bt = base_type.base_type_init;

    this._mt = meta_type.meta_type_init;
    this._last_mt = meta_type.meta_type_init;
  }

  operator(last: metaHandInfo, ct: col_type): void {
    // this should never ever be called on col_empty
    // assert(ct != col_empty)

    this._ct = ct;

    // set older values, yeah yeah, i know
    this._last_ct = last._ct;
    this.last_last_bt = last._last_bt;
    this._last_bt = last._bt;
    this._last_mt = last._mt;

    /* ok now actually do stuff */

    // update this hand's cc type for this row
    this._bt = determine_base_pattern_type(ct, this._last_ct);

    // now that we have determined base_type, we can look for more complex
    // patterns
    this._mt = determine_meta_type(
      this._bt,
      this._last_bt,
      this.last_last_bt,
      last.last_last_bt,
      this._last_mt,
    );
  }
}
