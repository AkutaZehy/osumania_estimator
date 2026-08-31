// Port of Etterna 0.72.3 IntervalInfo.h

/** Exact numeric layout of C++ `enum tap_size` (IntervalInfo.h). */
export const tap_size = {
  single: 0,
  jump: 1,
  hand: 2,
  quad: 3,
  num_tap_size: 4,
} as const;
export type tap_size = (typeof tap_size)[keyof typeof tap_size];

/**
 * simple struct to accumulate raw note info across an interval as it's
 * processed by row, will be reset at the end of the interval
 */
export class ItvInfo {
  /** total taps */
  total_taps = 0;
  /** non single taps */
  chord_taps = 0;
  /** count of taps for each tap_size */
  taps_by_size: number[] = [0, 0, 0, 0];
  /**
   * number related to amount of jumps in the interval.
   * inflated by dense hs/js mix
   */
  mixed_hs_density_tap_bonus = 0;

  /** resets all the stuff that accumulates across intervals */
  handle_interval_end(): void {
    this.total_taps = 0;

    this.chord_taps = 0;
    this.mixed_hs_density_tap_bonus = 0;

    this.taps_by_size.fill(0);
  }

  update_tap_counts(row_count: number): void {
    this.total_taps += row_count;

    // ALWAYS COUNT NUMBER OF TAPS IN CHORDS
    if (row_count > 1) {
      this.chord_taps += row_count;
    }

    // ALWAYS COUNT NUMBER OF TAPS IN CHORDS
    this.taps_by_size[row_count - 1]! += row_count;

    // maybe move this to metaitvinfo?
    // we want mixed hs/js to register as hs, even at relatively sparse hand
    // density
    if (this.taps_by_size[tap_size.hand]! > 0) {
      // this seems kinda extreme? it'll add the number of jumps in the
      // whole interval every hand? maybe it needs to be that extreme?
      this.mixed_hs_density_tap_bonus += this.taps_by_size[tap_size.jump]!;
    }
  }
}
