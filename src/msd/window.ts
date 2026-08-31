// ============================================================
// MSD engine — CalcMovingWindow (port of CalcWindow.h)
// Fixed 6-slot moving window with statistical queries. The slot layout
// matters: window N reads slots [6-N .. 5], i.e. the N most recent values.
// ============================================================

export const max_moving_window_size = 6;
export const ccacc_timing_check_size = 3;

import { any_ms_is_greater, fastsqrt } from "./num.js";

export class CalcMovingWindow<T extends number> {
  private _itv_vals: T[] = [0 as T, 0 as T, 0 as T, 0 as T, 0 as T, 0 as T];

  /** Push a new value (shifts the window left, newest at slot 5). */
  operator(new_val: T): void {
    for (let i = 1; i < max_moving_window_size; ++i) {
      this._itv_vals[i - 1] = this._itv_vals[i]!;
    }
    this._itv_vals[max_moving_window_size - 1] = new_val;
  }

  at(pos: number): T {
    return this._itv_vals[pos]!;
  }

  set(pos: number, val: T): void {
    this._itv_vals[pos] = val;
  }

  /** Most recent value. */
  get_now(): T {
    return this._itv_vals[max_moving_window_size - 1]!;
  }

  /** Oldest value inside the 6-slot window (second to last slot). */
  get_last(): T {
    return this._itv_vals[max_moving_window_size - 2]!;
  }

  get_total_for_window(window: number): T {
    let o = 0 as T;
    let i = max_moving_window_size;
    while (i > max_moving_window_size - window) {
      --i;
      o = (o + this._itv_vals[i]!) as T;
    }
    return o;
  }

  get_max_for_window(window: number): T {
    let o = 0 as T;
    let i = max_moving_window_size;
    while (i > max_moving_window_size - window) {
      --i;
      o = (this._itv_vals[i]! > o ? this._itv_vals[i]! : o) as T;
    }
    return o;
  }

  get_min_for_window(window: number): T {
    let o = this.get_now();
    let i = max_moving_window_size;
    while (i > max_moving_window_size - window) {
      --i;
      o = (this._itv_vals[i]! < o ? this._itv_vals[i]! : o) as T;
    }
    return o;
  }

  get_mean_of_window(window: number): number {
    let o = 0 as T;
    let i = max_moving_window_size;
    while (i > max_moving_window_size - window) {
      --i;
      o = (o + this._itv_vals[i]!) as T;
    }
    return (o as number) / window;
  }

  get_total_for_windowf(window: number): number {
    let o = 0.0;
    let i = max_moving_window_size;
    while (i > max_moving_window_size - window) {
      --i;
      o += this._itv_vals[i]!;
    }
    return o;
  }

  get_cv_of_window(window: number): number {
    let sd = 0.0;
    const avg = this.get_mean_of_window(window);
    let i = max_moving_window_size;
    while (i > max_moving_window_size - window) {
      --i;
      sd += (this._itv_vals[i]! - avg) * (this._itv_vals[i]! - avg);
    }
    return fastsqrt(sd / window) / avg;
  }

  /** cv check with the center (slot 4) anchor divided by factor. */
  ccacc_timing_check(factor: number, threshold: number): boolean {
    this._itv_vals[4] = (this._itv_vals[4]! / factor) as T;
    const o = this.get_cv_of_window(ccacc_timing_check_size);
    this._itv_vals[4] = (this._itv_vals[4]! * factor) as T;
    return o < threshold;
  }

  /** cv check with the center (slot 4) cc multiplied by factor. */
  acca_timing_check(factor: number, threshold: number): boolean {
    this._itv_vals[4] = (this._itv_vals[4]! * factor) as T;
    const o = this.get_cv_of_window(ccacc_timing_check_size);
    this._itv_vals[4] = (this._itv_vals[4]! / factor) as T;
    return o < threshold;
  }

  /** roll-vs-oht ambiguity resolved by which of the last two values is higher. */
  roll_timing_check(factor: number, threshold: number): boolean {
    if (any_ms_is_greater(this._itv_vals[4]!, this._itv_vals[5]!)) {
      return this.ccacc_timing_check(factor, threshold);
    }
    return this.acca_timing_check(factor, threshold);
  }

  zero(): void {
    this._itv_vals = [0 as T, 0 as T, 0 as T, 0 as T, 0 as T, 0 as T];
  }

  fill(val: T): void {
    this._itv_vals = [val, val, val, val, val, val];
  }
}
