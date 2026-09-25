// Port of Etterna 0.72.3 SequencedBaseDiffCalc.h
// MS difficulty bases are constructed row by row here: nps::actual_cancer
// (NPSBase/MSBase/itv_points), ceejay (CJBase), techyo (TechBase) and the
// grindscale pass. Debug-only plumbing of the original is omitted.

import {
  both_hands,
  col_type,
  finalscaler,
  hand_col_ids,
  max_rows_for_single_interval,
  nps_base_multiplier,
  Skillset,
  s_init,
} from "./enums.js";
import {
  clamp,
  cv_trunc_fill,
  div_high_by_low,
  fastsqrt,
  ms_from,
  ms_to_bpm,
  ms_to_scaled_nps,
  sum_trunc_fill,
  weighted_average,
} from "./num.js";
import { CalcMovingWindow } from "./window.js";
import { Calc, itv_idx_to_time } from "./calc.js";
import { determine_col_type } from "./dependent/HD_BasicSequencing.js";
import type { SequencerGeneral } from "./dependent/GenericSequencing.js";
import { basescalers } from "./basescalers.js";

/// required percentage of average notes to pass
export const min_threshold = 0.65;
export const downscale_logbase = Math.log(6.2);

export const scaler_for_ms_base = 1.175;
// i do not know a proper name for these
export const ms_base_finger_weighter_2 = 9.0;
export const ms_base_finger_weighter = 5.5;

const ms_dummy = 360.0;

/** CalcMSEstimate: hardest-n ms estimate of a sorted interval sample. */
export function CalcMSEstimate(input: number[], burp: number): number {
  const num_used = burp;

  if (input.length === 0) {
    return 0.0;
  }

  // sort before truncating/filling (the C++ sorts in place; the caller's
  // vector is already sorted by the time the estimate variants run, so a
  // per-call copy is equivalent)
  const sorted = [...input].sort((a, b) => a - b);

  // mostly try to push down stuff like jumpjacks
  let cv_yo = cv_trunc_fill(sorted, burp, ms_dummy) + 0.5;
  cv_yo = clamp(cv_yo, 0.5, 1.25);

  // basically doing a jank average, bigger m = lower difficulty
  const m = sum_trunc_fill(sorted, num_used, ms_dummy);

  // add 1 to num_used because some meme about sampling
  // same thing as jack stuff, convert to bpm and then nps
  const bpm_est = ms_to_bpm(m / (num_used + 1));
  const nps_est = bpm_est / 15.0;
  const fdiff = nps_est * cv_yo;
  return fdiff;
}

function scaly_ms_estimate(input: number[], scaler: number): number {
  let o = CalcMSEstimate(input, 3);
  if (input.length > 3) {
    o = Math.max(o, CalcMSEstimate(input, 4) * scaler);
  }
  if (input.length > 4) {
    o = Math.max(o, CalcMSEstimate(input, 5) * scaler * scaler);
  }
  return o;
}

export const nps = {
  /** determine NPSBase, itv_points, MSBase for this hand */
  actual_cancer(calc: Calc, hand: number): void {
    // finger row times
    let last_left_row_time = s_init;
    let last_right_row_time = s_init;

    for (let itv = 0; itv < calc.numitv; ++itv) {
      let notes = 0;

      // times between rows for this interval for each finger
      const left_finger_ms: number[] = [];
      const right_finger_ms: number[] = [];

      for (let row = 0; row < calc.itv_size[itv]!; ++row) {
        const cur = calc.adj_ni[itv]![row]!;
        notes += cur.hand_counts[hand]!;

        const crt = cur.row_time;
        switch (determine_col_type(cur.row_notes, hand_col_ids[hand]!)) {
          case col_type.col_left:
            if (last_left_row_time !== s_init) {
              const left_ms = ms_from(crt, last_left_row_time);
              left_finger_ms.push(left_ms);
            }
            last_left_row_time = crt;
            break;
          case col_type.col_right:
            if (last_right_row_time !== s_init) {
              const right_ms = ms_from(crt, last_right_row_time);
              right_finger_ms.push(right_ms);
            }
            last_right_row_time = crt;
            break;
          case col_type.col_ohjump:
            if (last_right_row_time !== s_init) {
              const right_ms = ms_from(crt, last_right_row_time);
              right_finger_ms.push(right_ms);
            }
            if (last_left_row_time !== s_init) {
              const left_ms = ms_from(crt, last_left_row_time);
              left_finger_ms.push(left_ms);
            }
            last_left_row_time = crt;
            last_right_row_time = crt;
            break;
          default:
            // none
            break;
        }
      }

      // nps for this interval
      const npsBase = notes * finalscaler * nps_base_multiplier;
      calc.init_base_diff_vals[hand]![0]![itv] = npsBase; // NPSBase

      // ms base for this interval
      const left = scaly_ms_estimate(left_finger_ms, scaler_for_ms_base);
      const right = scaly_ms_estimate(right_finger_ms, scaler_for_ms_base);
      let msdiff = 0.0;
      if (left > right) {
        msdiff = weighted_average(left, right, ms_base_finger_weighter, ms_base_finger_weighter_2);
      } else {
        msdiff = weighted_average(right, left, ms_base_finger_weighter, ms_base_finger_weighter_2);
      }
      const msbase = finalscaler * msdiff;
      calc.init_base_diff_vals[hand]![1]![itv] = msbase; // MSBase

      // set points for this interval
      calc.itv_points[hand]![itv] = notes * 2;
    }
  },

  /** determine grindscaler using smoothed npsbase */
  grindscale(calc: Calc): void {
    let populated_intervals = 0;
    let avg_notes = 0.0;
    for (let itv = 0; itv < calc.numitv; ++itv) {
      let notes = 0.0;

      for (const hand of both_hands) {
        notes += calc.init_base_diff_vals[hand]![0]![itv]!;
      }

      if (notes > 0) {
        avg_notes += notes;
        populated_intervals++;
      }
    }

    if (populated_intervals > 0) {
      avg_notes /= populated_intervals;

      let failed_intervals = 0;

      for (let itv = 0; itv < calc.numitv; itv++) {
        let notes = 0.0;
        for (const hand of both_hands) {
          notes += calc.init_base_diff_vals[hand]![0]![itv]!;
        }

        // count only intervals with notes
        if (notes > 0.0 && notes < avg_notes * min_threshold) failed_intervals++;
      }

      // base grindscaler on how many intervals are passing
      // if the entire file is just single taps or empty:
      //   ask yourself... is it really worth playing?
      const file_length = itv_idx_to_time(populated_intervals - failed_intervals);
      // log minimum but if you move this you need to move the log base
      const ping = 0.3;
      const timescaler = ping * (Math.log(file_length + 1) / downscale_logbase) + ping;

      calc.grindscaler = clamp(timescaler, 0.1, 1.0);
    } else {
      calc.grindscaler = 0.1;
    }
  },
};

export class ceejay {
  readonly name = "CJ_Static";

  // params
  static_ms_weight = 0.65;
  min_ms = 75.0;

  base_tap_scaler = 3.0;
  huge_anchor_scaler = 1.15;
  small_anchor_scaler = 1.15;
  ccj_scaler = 1.25;
  cct_scaler = 1.5;
  ccn_scaler = 1.15;
  ccb_scaler = 1.25;

  row_counter = 0;

  is_cj = false;
  was_cj = false;
  is_scj = false;
  is_at_least_3_note_anch = false;
  last_was_3_note_anch = false;

  last_row_count = 0;
  last_last_row_count = 0;

  last_row_notes = 0;
  last_last_row_notes = 0;

  update_flags(row_notes: number, row_count: number): void {
    this.is_cj = this.last_row_count > 1 && row_count > 1;
    this.was_cj = this.last_row_count > 1 && this.last_last_row_count > 1;

    this.is_scj =
      row_count === 1 && this.last_row_count > 1 && (row_notes & this.last_row_notes) !== 0;

    this.is_at_least_3_note_anch =
      (row_notes & this.last_row_notes & this.last_last_row_notes) !== 0;

    this.last_last_row_count = this.last_row_count;
    this.last_row_count = row_count;

    this.last_last_row_notes = this.last_row_notes;
    this.last_row_notes = row_notes;

    this.last_was_3_note_anch = this.is_at_least_3_note_anch;
  }

  advance_base(any_ms: number, calc: Calc): void {
    if (this.row_counter >= max_rows_for_single_interval) {
      return;
    }

    // pushing back ms values, so multiply to nerf
    let pewpew = this.base_tap_scaler;

    if (this.is_at_least_3_note_anch && this.last_was_3_note_anch) {
      // biggy boy anchors and beyond
      pewpew = this.huge_anchor_scaler;
    } else if (this.is_at_least_3_note_anch) {
      // big boy anchors
      pewpew = this.small_anchor_scaler;
    } else {
      // single note
      if (!this.is_cj) {
        if (this.is_scj) {
          // was cj a little bit ago..
          if (this.was_cj) {
            // single note jack with 2 chords behind it
            // ccj (chord chord jack)
            pewpew = this.ccj_scaler;
          } else {
            // single note, not a jack, 2 chords behind
            // cct (chord chord tap)
            pewpew = this.cct_scaler;
          }
        }
      } else {
        // actual cj
        if (this.was_cj) {
          // cj now and was cj before, but not necessarily
          // with strong anchors
          if (this.is_at_least_3_note_anch) {
            // chord chord no anchors
            pewpew = this.ccn_scaler;
          } else {
            // cj now but wasn't even cj before
            // ccb (chordjack beginning)
            pewpew = this.ccb_scaler;
          }
        }
      }
    }

    // single note streams / regular jacks should retain the base
    // multiplier

    const ms = Math.max(this.min_ms, any_ms * pewpew);
    calc.cj_static[this.row_counter] = ms;
    ++this.row_counter;
  }

  // final output difficulty for this interval
  get_itv_diff(calc: Calc): number {
    if (this.row_counter === 0) {
      return 0.0;
    }

    // ms vals to counts
    const mode = new Map<number, number>();
    const static_ms: number[] = [];
    for (let i = 0; i < this.row_counter; ++i) {
      const v = Math.trunc(calc.cj_static[i]!);
      static_ms.push(calc.cj_static[i]!);
      mode.set(v, (mode.get(v) ?? 0) + 1);
    }
    let modev = 0;
    let modefreq = 0;
    for (const [v, freq] of mode) {
      if (freq > modefreq) {
        modev = v;
        modefreq = freq;
      }
    }
    for (let i = 0; i < static_ms.length; i++) {
      // weight = 0 means all values become modev
      static_ms[i] = weighted_average(static_ms[i]!, modev, this.static_ms_weight, 1.0);
    }

    const ms_total = static_ms.reduce((a, b) => a + b, 0);
    const ms_mean = ms_total / this.row_counter;
    return ms_to_scaled_nps(ms_mean);
  }

  interval_end(): void {
    this.row_counter = 0;
  }

  full_reset(): void {
    this.is_cj = false;
    this.was_cj = false;
    this.is_scj = false;
    this.is_at_least_3_note_anch = false;
    this.last_was_3_note_anch = false;

    this.last_row_count = 0;
    this.last_last_row_count = 0;

    this.last_row_notes = 0;
    this.last_last_row_notes = 0;
  }
}

export class techyo {
  readonly name = "TC_Static";

  // params
  tc_base_weight = 4.0;
  nps_base_weight = 9.0;
  rm_base_weight = 1.0;

  balance_comp_window = 36.0;
  chaos_comp_window = 4.0;
  tc_static_base_window = 2.0;

  // determines steepness of non-1/2 balance ratios
  balance_power = 2.0;
  min_balance_ratio = 0.2;
  balance_ratio_scaler = 1.0;

  // moving window of the last 3 {column, time} that showed up
  static readonly trill_window = 3;

  row_counter = 0;

  // jank stuff.. keep a small moving average of the base diff
  teehee = new CalcMovingWindow<number>();

  // max value of rm diff for this interval, this will be an exception to the
  // only storing ms rule
  rm_itv_max_diff = 0.0;
  jack_itv_diff = 0.0;

  advance_base(
    seq: SequencerGeneral,
    ct: col_type,
    calc: Calc,
    hand: number,
    row_time: number,
  ): void {
    void hand;
    if (this.row_counter >= max_rows_for_single_interval) {
      return;
    }

    const chaos_comp = this.calc_chaos_comp(seq, ct, row_time);
    this.teehee.operator(chaos_comp);
    calc.tc_static[this.row_counter] = this.teehee.get_mean_of_window(
      Math.trunc(this.tc_static_base_window),
    );
    ++this.row_counter;
  }

  advance_rm_comp(rm_diff: number): void {
    this.rm_itv_max_diff = Math.max(this.rm_itv_max_diff, rm_diff);
  }

  advance_jack_comp(hardest_itv_jack_ms: number): void {
    this.jack_itv_diff = ms_to_scaled_nps(hardest_itv_jack_ms) * basescalers[Skillset.JackSpeed]!;
  }

  // final output difficulty for this interval
  // the output of this is officially TechBase for an interval
  get_itv_diff(nps_base: number, _calc: Calc): number {
    let rmbase = this.rm_itv_max_diff;
    const nps_biased_chaos_base = weighted_average(
      this.get_tc_base(_calc),
      nps_base,
      this.tc_base_weight,
      this.nps_base_weight,
    );
    if (rmbase >= nps_biased_chaos_base) {
      // for rm dominant intervals, use tc to drag diff down
      rmbase = weighted_average(
        rmbase,
        nps_biased_chaos_base,
        this.rm_base_weight,
        1.0,
      );
    }
    return Math.max(nps_biased_chaos_base, rmbase);
  }

  interval_end(): void {
    this.row_counter = 0;
    this.rm_itv_max_diff = 0.0;
    this.jack_itv_diff = 0.0;
  }

  full_reset(): void {
    this.row_counter = 0;
    this.rm_itv_max_diff = 0.0;
    this.jack_itv_diff = 0.0;
    this.teehee.zero();
  }

  // get the interval base diff, which will then be merged via weighted
  // average with npsbase, and then compared to max_rm diff
  get_tc_base(calc: Calc): number {
    if (this.row_counter === 0) {
      return 0.0;
    }

    let ms_total = 0.0;
    for (let i = 0; i < this.row_counter; ++i) {
      ms_total += calc.tc_static[i]!;
    }

    const ms_mean = ms_total / this.row_counter;
    return ms_to_scaled_nps(ms_mean);
  }

  // cv checks (clamped) and column ratio of most recent ms times
  calc_chaos_comp(
    seq: SequencerGeneral,
    ct: col_type,
    row_time: number,
  ): number {
    void row_time;
    const a = seq.get_sc_ms_now(ct);
    let b: number;
    if (ct === col_type.col_ohjump) {
      b = seq.get_sc_ms_now(ct, false);
    } else {
      b = seq.get_cc_ms_now();
    }

    // arithmetic mean of ms times since (last note in this column) and
    // (last note in the other column)
    const c = (a + b) / 2;

    // coeff var. of last N ms times on either column
    let pineapple = seq._mw_any_ms.get_cv_of_window(Math.trunc(this.chaos_comp_window));
    // coeff var. of last N ms times on left column
    let porcupine = seq._mw_sc_ms[col_type.col_left]!.get_cv_of_window(
      Math.trunc(this.chaos_comp_window),
    );
    // coeff var. of last N ms times on right column
    let sequins = seq._mw_sc_ms[col_type.col_right]!.get_cv_of_window(
      Math.trunc(this.chaos_comp_window),
    );

    // coeff var. is sd divided by mean
    const oioi = 0.5;
    const ioio = 0.5;
    pineapple = clamp(pineapple + oioi, oioi, ioio + oioi);
    porcupine = clamp(porcupine + oioi, oioi, ioio + oioi);
    sequins = clamp(sequins + oioi, oioi, ioio + oioi);

    // most recent ms time in left column / right column
    const scoliosis = seq._mw_sc_ms[col_type.col_left]!.get_now();
    const poliosis = seq._mw_sc_ms[col_type.col_right]!.get_now();

    let obliosis: number;
    if (ct === col_type.col_left) {
      obliosis = poliosis / scoliosis;
    } else {
      obliosis = scoliosis / poliosis;
    }

    // the ratio of most recent ms times between left and right column must
    // be [1,10]; 1 = perfect trill or slowing down trill; 10 = quickly
    // speeding up trill (flams)
    obliosis = clamp(obliosis, 1.0, 10.0);

    // sqrt of ([1,inf] - 1); 0 = perfect trill or perfect jumpjack
    let pewp = fastsqrt(div_high_by_low(scoliosis, poliosis) - 1.0);

    // [0,inf] divided by [1,10]
    pewp /= obliosis;

    // average of (cv left, cv right, cv both), simplified to [0.5,1.5]
    const vertebrae = clamp((pineapple + porcupine + sequins) / 3.0, oioi, ioio + oioi);

    // result is ms divided by fudgy cv number
    return c / vertebrae;
  }
}

// Signpost: adding a CalcPatternMod touches all of —
//   enums.ts (mod table + [de]activation values), mina.ts
//   (advance_sequencing / setup / full_reset / set_agnostic_pmods /
//   set_dependent_pmods), InitAdjDiff's pmods_used (calc.ts), and a
//   Mod/Sequencing pair in agnostic/ or dependent/.
export class diffz {
  _nps = nps;
  _tc = new techyo();
  _cj = new ceejay();

  interval_end(): void {
    this._tc.interval_end();
    this._cj.interval_end();
  }

  full_reset(): void {
    this.interval_end();
    this._cj.full_reset();
    this._tc.full_reset();
  }
}
