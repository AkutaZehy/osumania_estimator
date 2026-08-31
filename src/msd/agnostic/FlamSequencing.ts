// Port of Etterna 0.72.3 FlamSequencing.h

import { clamp, fastsqrt } from "../num.js";

export const max_flam_jammies = 4;

/// Struct describing a flam of 2-4 taps.
/// A flam is not 1 tap.
/// Flams are n > 1 taps which may be hit as a chord.
export class flam {
  /// columns seen
  unsigned_unseen = 0;

  /**
   * size in ROWS, not columns. if flam size == 1 we do not yet have a flam
   * and we have no current relevant values in ms[], any that are set will be
   * leftovers from the last sequence, this is to optimize out setting
   * rowtimes or calculating ms times
   */
  size = 1;

  /// size > 1.
  /// is this actually more efficient than calling a bool check func?
  flammin = false;

  /**
   * ms values, 3 ms values = 4 rows, optimize by just recycling values
   * without resetting and indexing up to the size counter to get duration
   */
  ms: number[] = [0.0, 0.0, 0.0];

  /// is this row exclusively additive with the current flam sequence?
  comma_comma_coolmeleon(notes: number): boolean {
    return (this.unsigned_unseen & notes) === 0;
  }

  /// gather cumulative millisecond gap for entire flam
  get_dur(): number {
    // cba to loop
    // (upstream case 1 asserts and falls through to case 2 — a no-op assert
    // in release builds, so the fallthrough is preserved)
    switch (this.size) {
      case 1:
      // can't have 1 row flams
      case 2:
        return this.ms[0]!;
      case 3:
        return this.ms[0]! + this.ms[1]!;
      case 4:
        return this.ms[0]! + this.ms[1]! + this.ms[2]!;
      default:
        // assert(0) upstream
        return 0.0;
    }
  }

  /// begin flam sequence processing
  start(ms_now: number, notes: number): void {
    this.flammin = true;
    this.unsigned_unseen = 0;

    this.grow(ms_now, notes);
  }

  /// continue flam sequence processing
  grow(ms_now: number, notes: number): void {
    if (this.size === max_flam_jammies) {
      return;
    }

    this.unsigned_unseen |= notes;
    this.ms[this.size - 1] = ms_now;

    // adjust size after setting ms, size starts at 1
    ++this.size;
  }

  reset(): void {
    this.flammin = false;
    this.size = 1;
  }
}

/// Sequencer for FlamJam, to handle row by row processing of flams.
/// Collects up to 4 flams per interval to describe its flammyness.
export class FJ_Sequencer {
  /// current tracking flam
  flim = new flam();

  /// scan for flam chords in this window
  group_tol = 0.0;
  /// tolerance for each column step
  step_tol = 0.0;
  mod_scaler = 0.0;

  /// number of flams
  flam_counter = 0;

  /**
   * track up to 4 flams per interval, if the number of flams exceeds this
   * number we'll just min_set (OR we could keep a moving array of flams, and
   * not flams, which would make consecutive flams much more debilitating and
   * interval proof the sequencing.. however.. it's probably not necessary to
   * get that fancy
   */
  mod_parts: number[] = [1.0, 1.0, 1.0, 1.0];

  /**
   * there's too many flams already, don't bother with new sequencing and
   * shortcut into a minset in flamjammod
   * technically this means we won't start constructing sequences again until
   * the next interval.. not sure if this is desired behavior
   */
  the_fifth_flammament = false;

  set_params(gt: number, st: number, ms: number): void {
    this.group_tol = gt;
    this.step_tol = st;
    this.mod_scaler = ms;
  }

  complete_seq(): void {
    if (this.flam_counter < max_flam_jammies) {
      this.mod_parts[this.flam_counter] = this.construct_mod_part();
      ++this.flam_counter;
    } else {
      // bro its just flams
      this.the_fifth_flammament = true;
    }

    this.flim.reset();
  }

  flammin_col_check(notes: number): boolean {
    // this function should never be used to start a flam
    // (assert(flim.flammin) upstream)

    // note : in order to prevent the last row of a quad flam from being
    // elibible to start a new flam (logically it makes no sense), instead
    // of catching full quads and resetting when we get them, we'll let them
    // pass throgh into the next note row, no matter what the row is it will
    // fail the xor check and be reset then, making only the row _after_ the
    // full flam eligible for a new start
    return this.flim.comma_comma_coolmeleon(notes);
  }

  /// check for anything that would break the sequence
  flammin_tol_check(ms_now: number): boolean {
    // check if ms from last row is greater than the group tolerance
    if (ms_now > this.group_tol) {
      return false;
    }

    // check if the new flam duration would exceed the group tolerance with
    // the current row added
    if (this.flim.get_dur() + ms_now > this.group_tol) {
      return false;
    }

    // we may be able to continue the sequence, run the col check
    return true;
  }

  operator(ms_now: number, notes: number): void {
    // if we already have the max number of flams
    // (maybe should remove this shortcut optimization)
    // seems like we never even hit it so...
    if (this.the_fifth_flammament) {
      return;
    }

    // haven't started, if we're under the step tolerance, start
    if (!this.flim.flammin) {
      // 99.99% of cases
      if (ms_now > this.step_tol) {
        return;
      }
      {
        this.flim.start(ms_now, notes);
      }
    } else {
      // passed the tolerance checks, run the col checks
      if (this.flammin_tol_check(ms_now)) {
        // passed col check, advance flam
        if (this.flammin_col_check(notes)) {
          this.flim.grow(ms_now, notes);
        } else {
          // we failed the col check, but we've passed the tol checks,
          // which means this row is eligible to begin a new flam
          // sequence, complete the one that exists and start again
          this.complete_seq();
          this.flim.start(ms_now, notes);
        }
      } else {
        // reset if we exceed tolerance checks
        this.complete_seq();
      }
    }
  }

  handle_interval_end(): void {
    // we probably don't want to do this, just let it build potential
    // sequences across intervals
    // flam.reset();

    this.the_fifth_flammament = false;
    this.flam_counter = 0;

    // reset everything to 1, as we build flams we will replace 1 with < 1
    // values, the more there are, the lower (stronger) the pattern mod
    this.mod_parts.fill(1.0);
  }

  construct_mod_part(): number {
    // total duration of flam
    const dur = this.flim.get_dur();

    // scale to size of flam, we want jumpflams to punish less than quad
    // flams (while still downscaling jumptrill flams)
    // flams that register as 95% of the size adjusted window will be
    // punished less than those that register at 2%
    let dur_prop = dur / this.group_tol;
    dur_prop /= this.flim.size / this.mod_scaler;
    dur_prop = clamp(dur_prop, 0.0, 1.0);

    return fastsqrt(dur_prop);
  }
}
