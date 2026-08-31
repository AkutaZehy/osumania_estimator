// Port of Etterna 0.72.3 Dependent/IntervalHandInfo.h

import { col_type } from "../enums.js";
import { ct_loop } from "./HD_BasicSequencing.js";
import { div_high_by_low, div_low_by_high, diff_high_by_low } from "../num.js";
import { CalcMovingWindow } from "../window.js";

/// accumulates hand specific info across an interval as it's processed by row
export class ItvHandInfo {
  private _col_taps: number[] = [0, 0, 0];

  /// switch to keeping generic moving windows here, if any mod needs a moving
  /// window query for anything here, we've already saved computation. any mod
  /// that needs custom moving windows based on sequencing will have to keep
  /// its own container, but otherwise these should be referenced
  // C++: std::array<CalcMovingWindow<int>, num_col_types> — plain array so the
  // col_type union (which includes the col_empty / col_init sentinels) can index it
  private _mw_col_taps: CalcMovingWindow<number>[] = [
    new CalcMovingWindow<number>(),
    new CalcMovingWindow<number>(),
    new CalcMovingWindow<number>(),
  ];
  private _mw_hand_taps = new CalcMovingWindow<number>();

  set_col_taps(col: col_type): void {
    // this could be more efficient but at least it's clear (ish)?
    switch (col) {
      case col_type.col_left:
      case col_type.col_right:
        ++this._col_taps[col]!;
        break;
      case col_type.col_ohjump:
        ++this._col_taps[col_type.col_left]!;
        ++this._col_taps[col_type.col_right]!;
        this._col_taps[col]! += 2;
        break;
      default:
        // assert(0)
        break;
    }
  }

  /// handle end of interval behavior here
  interval_end(): void {
    // update interval mw for hand taps
    this._mw_hand_taps.operator(
      this._col_taps[col_type.col_left]! + this._col_taps[col_type.col_right]!,
    );

    // update interval mws for col taps
    for (const ct of ct_loop) {
      this._mw_col_taps[ct]!.operator(this._col_taps[ct]!);
    }

    // reset taps per col on this hand
    this._col_taps.fill(0);
  }

  /// zeroes out all values for everything, complete reset for when we swap
  /// hands maybe move to constructor and reconstruct when swapping hands??
  zero(): void {
    this._col_taps.fill(0);

    for (const mw of this._mw_col_taps) {
      mw.zero();
    }
    this._mw_hand_taps.zero();
  }

  /// access functions for col tap counts
  get_col_taps_nowi(ct: col_type): number {
    return this._mw_col_taps[ct]!.get_now();
  }

  /// cast to float for divisioning and clean screen
  get_col_taps_nowf(ct: col_type): number {
    return this._mw_col_taps[ct]!.get_now();
  }

  get_col_taps_windowi(ct: col_type, window: number): number {
    return this._mw_col_taps[ct]!.get_total_for_window(window);
  }

  /// cast to float for divisioning and clean screen
  get_col_taps_windowf(ct: col_type, window: number): number {
    return this._mw_col_taps[ct]!.get_total_for_window(window);
  }

  /// col operations
  cols_equal_now(): boolean {
    return (
      this.get_col_taps_nowi(col_type.col_left) ===
      this.get_col_taps_nowi(col_type.col_right)
    );
  }

  cols_equal_window(window: number): boolean {
    return (
      this.get_col_taps_windowi(col_type.col_left, window) ===
      this.get_col_taps_windowi(col_type.col_right, window)
    );
  }

  get_col_prop_high_by_low(): number {
    return div_high_by_low(
      this.get_col_taps_nowf(col_type.col_left),
      this.get_col_taps_nowf(col_type.col_right),
    );
  }

  get_col_prop_low_by_high(): number {
    return div_low_by_high(
      this.get_col_taps_nowf(col_type.col_left),
      this.get_col_taps_nowf(col_type.col_right),
    );
  }

  get_col_prop_high_by_low_window(window: number): number {
    return div_high_by_low(
      this.get_col_taps_windowf(col_type.col_left, window),
      this.get_col_taps_windowf(col_type.col_right, window),
    );
  }

  get_col_prop_low_by_high_window(window: number): number {
    return div_low_by_high(
      this.get_col_taps_windowf(col_type.col_left, window),
      this.get_col_taps_windowf(col_type.col_right, window),
    );
  }

  get_col_diff_high_by_low(): number {
    return diff_high_by_low(
      this.get_col_taps_nowi(col_type.col_left),
      this.get_col_taps_nowi(col_type.col_right),
    );
  }

  get_col_diff_high_by_low_window(window: number): number {
    return diff_high_by_low(
      this.get_col_taps_windowi(col_type.col_left, window),
      this.get_col_taps_windowi(col_type.col_right, window),
    );
  }

  /// access functions for hand tap counts
  get_taps_nowi(): number {
    return this._mw_hand_taps.get_now();
  }

  /// cast to float for divisioning and clean screen
  get_taps_nowf(): number {
    return this._mw_hand_taps.get_now();
  }

  get_taps_windowi(window: number): number {
    return this._mw_hand_taps.get_total_for_window(window);
  }

  /// cast to float for divisioning and clean screen
  get_taps_windowf(window: number): number {
    return this._mw_hand_taps.get_total_for_window(window);
  }
}
