// Port of Etterna 0.72.3 Dependent/MetaIntervalHandInfo.h

import { num_base_types } from "./HD_BasicSequencing.js";
import { num_meta_types } from "./HD_MetaSequencing.js";
import { ItvHandInfo } from "./IntervalHandInfo.js";

/// this _may_ prove to be overkill
export class metaItvHandInfo {
  _itvhi = new ItvHandInfo();

  /// handle end of interval
  interval_end(): void {
    this._base_types.fill(0);
    this._meta_types.fill(0);

    this._itvhi.interval_end();
  }

  /// zero everything out for end of hand loop so the trailing values from the
  /// left hand don't end up in the start of the right (not that it would make
  /// a huge difference, but it might be abusable
  zero(): void {
    this._base_types.fill(0);
    this._meta_types.fill(0);

    this._itvhi.zero();
  }

  // C++: std::array<int, num_base_types> = { 0, 0, 0, 0, 0, 0 };
  _base_types: number[] = new Array<number>(num_base_types).fill(0);
  // C++: std::array<int, num_meta_types> = { 0, 0, 0, 0, 0, 0 };
  _meta_types: number[] = new Array<number>(num_meta_types).fill(0);
}
