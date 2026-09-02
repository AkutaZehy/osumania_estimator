// ============================================================
// MSD engine — orchestrator and skillset solver
// Ports of Etterna 0.72.3: MinaCalc.cpp (CalcMain / Chisel / CalcInternal /
// StamAdjust / JackStamAdjust / jackloss / InitAdjDiff), Ulbu.h
// (TheGreatBazoinkazoinkInTheSky agnostic+dependent pmod loops and sequenced
// base diff wiring), and the MinaSDCalc entry points.
// ============================================================

import {
  NUM_SKILLSET,
  Skillset,
  AkutaSkillset,
  CalcPatternMod,
  both_hands,
  col_type,
  hands,
  max_intervals,
  max_rating,
  max_rows_for_single_interval,
  min_rating,
  ms_init,
  ssr_goal_cap,
  s_init,
  hand_col_ids,
  low_acc_cutoff,
  type NoteInfo,
} from "./enums.js";
import {
  aggregate_skill,
  clamp,
  downscale_low_accuracy_scores,
  erfc,
  fastpow,
  fastsqrt,
  max_index,
  ms_from,
  ms_to_scaled_nps,
} from "./num.js";
import { Calc, PatternMods, fast_walk_and_check_for_skip, Smooth, MSSmooth } from "./calc.js";
import { diffz, nps } from "./SequencedBaseDiffCalc.js";
import { basescalers } from "./basescalers.js";

import { metaRowInfo } from "./agnostic/MetaRowInfo.js";
import { metaItvInfo } from "./agnostic/MetaIntervalInfo.js";
import { StreamMod } from "./agnostic/StreamMod.js";
import { JSMod } from "./agnostic/JSMod.js";
import { HSMod } from "./agnostic/HSMod.js";
import { CJMod } from "./agnostic/CJMod.js";
import { CJDensityMod } from "./agnostic/CJDensityMod.js";
import { HSDensityMod } from "./agnostic/HSDensityMod.js";
import { FlamJamMod } from "./agnostic/FlamJamMod.js";
import {
  TheThingLookerFinderThing,
  TheThingLookerFinderThing2,
} from "./agnostic/TheThingFinder.js";

import { determine_col_type } from "./dependent/HD_BasicSequencing.js";
import { base_type } from "./dependent/HD_BasicSequencing.js";
import { metaHandInfo } from "./dependent/MetaHandInfo.js";
import { metaItvHandInfo } from "./dependent/MetaIntervalHandInfo.js";
import { SequencerGeneral } from "./dependent/GenericSequencing.js";
import { OHJumpModGuyThing } from "./dependent/OHJMod.js";
import { CJOHJumpMod } from "./dependent/CJOHJMod.js";
import { CJOHAnchorMod } from "./dependent/CJOHAnchorMod.js";
import { BalanceMod } from "./dependent/BalanceMod.js";
import { RollMod } from "./dependent/RollMod.js";
import { RollJSMod } from "./dependent/RollJSMod.js";
import { OHTrillMod } from "./dependent/OHTMod.js";
import { VOHTrillMod } from "./dependent/VOHTMod.js";
import { ChaosMod } from "./dependent/ChaosMod.js";
import { RunningManMod } from "./dependent/RunningManMod.js";
import { MinijackMod } from "./dependent/MinijackMod.js";
import { WideRangeBalanceMod } from "./dependent/WideRangeBalanceMod.js";
import { WideRangeRollMod } from "./dependent/WideRangeRollMod.js";
import { WideRangeJumptrillMod } from "./dependent/WideRangeJumptrillMod.js";
import { WideRangeJJMod } from "./dependent/WideRangeJJMod.js";
import { WideRangeAnchorMod } from "./dependent/WideRangeAnchorMod.js";

/** UlbuAcolytes.h: `{ 0.F, 0.91F, 0.75F, 0.77F, 0.93F, 1.01F, 1.02F, 1.06F }` */

/* The stamina model works by asserting a minimum difficulty relative to the
 * supplied player skill level for which the player's stamina begins to wane.
 * (MinaCalc.cpp StamAdjust) */
export function StamAdjust(x: number, ss: number, calc: Calc, hand: number): void {
  // Stamina Model params
  const stam_ceil = 1.075234; // stamina multiplier max
  const stam_mag = 243.0; // multiplier generation scalar
  // how fast the floor rises (it's lava)
  const stam_fscale = 500.0;
  // proportion of player difficulty at which stamina tax begins
  const stam_prop = 0.69424;

  // stamina multiplier min (increases as chart advances)
  let stam_floor = 0.95;
  let mod = 0.95; // multiplier

  let avs1: number;
  let avs2 = 0.0;
  let local_ceil: number;
  const super_stam_ceil = 1.09;

  const base_diff = calc.base_diff_for_stam_mod[hand]![ss]!;
  const diff = calc.base_adj_diff[hand]![ss]!;

  for (let i = 0; i < calc.numitv; i++) {
    avs1 = avs2;
    avs2 = base_diff[i]!;
    mod += ((((avs1 + avs2) / 2.0) / (stam_prop * x)) - 1.0) / stam_mag;
    if (mod > 0.95) {
      stam_floor += (mod - 0.95) / stam_fscale;
    }
    local_ceil = stam_ceil * stam_floor;

    mod = Math.min(clamp(mod, stam_floor, local_ceil), super_stam_ceil);
    calc.stam_adj_diff[i] = diff[i]! * mod;
  }
}

// tuned for jacks
export function JackStamAdjust(x: number, calc: Calc, hand: number): Array<[number, number]> {
  // Jack stamina Model params (see above)
  const stam_ceil = 1.05234;
  const stam_mag = 23.0;
  const stam_fscale = 750.0;
  const stam_prop = 0.49424;
  // mod hard floor
  let stam_floor = 0.95;
  let mod = 1.0;

  let avs2 = 0.0;

  // mod hard cap
  const super_stam_ceil = 1.01;

  const diff = calc.jack_diff[hand]!;
  const output: Array<[number, number]> = new Array(diff.length);

  for (let i = 0; i < diff.length; i++) {
    const avs1 = avs2;
    avs2 = diff[i]![1];
    mod += ((((avs1 + avs2) / 2.0) / (stam_prop * x)) - 1.0) / stam_mag;
    if (mod > 0.95) {
      stam_floor += (mod - 0.95) / stam_fscale;
    }
    const local_ceil = stam_ceil * stam_floor;

    mod = Math.min(clamp(mod, stam_floor, local_ceil), super_stam_ceil);

    output[i] = [diff[i]![0], diff[i]![1] * mod];
  }

  return output;
}

const magic_num = 12.0;

/** std::erf equivalent (C++ jack_pointloser_func uses the accurate libm erf). */
function erf(x: number): number {
  return 1.0 - erfc(x);
}

function jack_pointloser_func(x: number, y: number): number {
  return Math.max(magic_num * erf(0.04 * (y - x)), 0.0);
}

/* ok this is a little jank, we are calculating jack loss looping over the
 * interval and interval size loop that adj_ni uses, or each rows per interval,
 * except we're doing it for each hand. (MinaCalc.cpp jackloss) */
export function jackloss(
  x: number,
  calc: Calc,
  hand: number,
  stam: boolean,
): number {
  const v = stam ? JackStamAdjust(x, calc, hand) : calc.jack_diff[hand]!;
  let total = 0.0;

  for (const y of v) {
    if (x < y[1] && y[1] > 0.0) {
      total += jack_pointloser_func(x, y[1]);
    }
  }

  return total;
}

// function to get points for skill determining loop in chisel
function CalcInternal(
  gotpoints: { v: number },
  x: number,
  ss: number,
  stam: boolean,
  calc: Calc,
  hand: number,
): void {
  if (stam) {
    StamAdjust(x, ss, calc, hand);
  }

  // final difficulty values to use
  const v = stam ? calc.stam_adj_diff : calc.base_adj_diff[hand]![ss]!;
  let pointloss_pow_val = 1.7;
  if (ss === Skillset.Chordjack) {
    pointloss_pow_val = 1.7;
  } else if (ss === Skillset.Technical) {
    pointloss_pow_val = 2.0;
  }

  for (let i = 0; i < calc.numitv; ++i) {
    if (x < v[i]!) {
      const pts = calc.itv_points[hand]![i]!;
      gotpoints.v -= pts - pts * fastpow(x / v[i]!, pointloss_pow_val);
    }
  }
}

/* pbm = point buffer multiplier (MinaCalc.cpp) */
const tech_pbm = 1.0;
const jack_pbm = 1.0175;
const stream_pbm = 1.01;
const bad_newbie_skillsets_pbm = 1.0;

/** each skillset should just be a separate calc function [todo] */
export function Chisel(
  calc: Calc,
  player_skill: number,
  resolution: number,
  score_goal: number,
  ss: number,
  stamina: boolean,
): number {
  // overall and stamina are calculated differently
  if (ss === Skillset.Overall || ss === Skillset.Stamina) {
    return min_rating;
  }

  const reqpoints = calc.MaxPoints * score_goal;
  const max_slap_dash_jack_cap_hack_tech_hat = calc.MaxPoints * 0.1;

  const calc_gotpoints = (curr_player_skill: number): number => {
    let gotpoints: number;
    switch (ss) {
      case Skillset.Technical:
        gotpoints = calc.MaxPoints * tech_pbm;
        break;
      case Skillset.JackSpeed:
        gotpoints = calc.MaxPoints * jack_pbm;
        break;
      case Skillset.Stream:
        gotpoints = calc.MaxPoints * stream_pbm;
        break;
      case Skillset.Jumpstream:
      case Skillset.Handstream:
      case Skillset.Chordjack:
      // Akuta extension skillsets use the neutral point buffer
      case AkutaSkillset.JackChord:
      case AkutaSkillset.JackTech:
      case AkutaSkillset.LNCoordination:
        gotpoints = calc.MaxPoints * bad_newbie_skillsets_pbm;
        break;
      default:
        gotpoints = 0.0;
        break;
    }
    const box = { v: gotpoints };
    for (const hand of both_hands) {
      if (ss === Skillset.JackSpeed) {
        box.v -= jackloss(curr_player_skill, calc, hand, stamina);
      } else {
        CalcInternal(box, curr_player_skill, ss, stamina, calc, hand);
      }
      if (ss === Skillset.Technical) {
        box.v -= fastsqrt(
          Math.min(
            max_slap_dash_jack_cap_hack_tech_hat,
            jackloss(curr_player_skill * 0.75, calc, hand, stamina) * 0.85,
          ),
        );
      }
    }
    return box.v;
  };

  let gotpoints: number;
  let curr_player_skill = player_skill;
  let curr_resolution = resolution;

  do {
    if (curr_player_skill > max_rating) {
      return min_rating;
    }

    curr_player_skill += curr_resolution;
    gotpoints = calc_gotpoints(curr_player_skill);
  } while (gotpoints < reqpoints);
  curr_player_skill -= curr_resolution; // We're too high. Undo our last move.
  curr_resolution /= 2;

  for (let iter = 1; iter <= 7; iter++) {
    // Refine
    if (curr_player_skill > max_rating) {
      return min_rating;
    }
    curr_player_skill += curr_resolution;
    gotpoints = calc_gotpoints(curr_player_skill);
    if (gotpoints > reqpoints) {
      curr_player_skill -= curr_resolution; // We're too high. Undo our last move.
    }
    curr_resolution /= 2.0;
  }

  return curr_player_skill + 2.0 * curr_resolution;
}

/* The new way we will attempt to differentiate skillsets rather than using
 * normalizers is by detecting whether or not we think a file is mostly
 * comprised of a given pattern (MinaCalc.cpp InitAdjDiff) */
function InitAdjDiff(calc: Calc, hand: number): void {
  const pmods_used: number[][] = [
    // overall, nothing, don't handle here
    [],

    // stream
    [
      CalcPatternMod.Stream,
      CalcPatternMod.OHTrill,
      CalcPatternMod.VOHTrill,
      CalcPatternMod.Roll,
      CalcPatternMod.Chaos,
      CalcPatternMod.WideRangeRoll,
      CalcPatternMod.WideRangeJumptrill,
      CalcPatternMod.WideRangeJJ,
      CalcPatternMod.FlamJam,
    ],

    // js
    [
      CalcPatternMod.JS,
      CalcPatternMod.WideRangeBalance,
      CalcPatternMod.WideRangeJumptrill,
      CalcPatternMod.WideRangeJJ,
      CalcPatternMod.VOHTrill,
      CalcPatternMod.RollJS,
      CalcPatternMod.FlamJam,
    ],

    // hs
    [
      CalcPatternMod.HS,
      CalcPatternMod.OHJumpMod,
      CalcPatternMod.TheThing,
      CalcPatternMod.WideRangeRoll,
      CalcPatternMod.WideRangeJumptrill,
      CalcPatternMod.WideRangeJJ,
      CalcPatternMod.OHTrill,
      CalcPatternMod.VOHTrill,
      CalcPatternMod.FlamJam,
      CalcPatternMod.HSDensity,
    ],

    // stam, nothing, don't handle here
    [],

    // jackspeed, doesn't use pmods (atm)
    [],

    // chordjack
    [
      CalcPatternMod.CJ,
      CalcPatternMod.CJOHJump,
      CalcPatternMod.CJOHAnchor,
      CalcPatternMod.VOHTrill,
      CalcPatternMod.FlamJam,
      CalcPatternMod.WideRangeJumptrill,
    ],

    // tech, duNNO wat im DOIN
    [
      CalcPatternMod.OHTrill,
      CalcPatternMod.VOHTrill,
      CalcPatternMod.Balance,
      CalcPatternMod.Roll,
      CalcPatternMod.Chaos,
      CalcPatternMod.WideRangeJumptrill,
      CalcPatternMod.WideRangeJJ,
      CalcPatternMod.WideRangeBalance,
      CalcPatternMod.WideRangeRoll,
      CalcPatternMod.FlamJam,
      CalcPatternMod.Minijack,
      CalcPatternMod.TheThing,
      CalcPatternMod.TheThing2,
    ],
  ];

  const pmod_product_cur_interval = new Array<number>(NUM_SKILLSET).fill(1.0);

  // for each interval
  for (let i = 0; i < calc.numitv; ++i) {
    pmod_product_cur_interval.fill(1.0);

    // total pattern mods for each skillset
    for (let ss = 0; ss < NUM_SKILLSET; ++ss) {
      if (ss === Skillset.Overall || ss === Skillset.Stamina) {
        continue;
      }

      for (const pmod of pmods_used[ss]!) {
        pmod_product_cur_interval[ss]! *= calc.pmod_vals[hand]![pmod]![i]!;
      }
    }

    // main loop, for each skillset that isn't overall or stam
    for (let ss = 0; ss < NUM_SKILLSET; ++ss) {
      if (ss === Skillset.Overall || ss === Skillset.Stamina) {
        continue;
      }

      // reference to diff values in vectors
      const adj_diff_cell = { get(): number { return calc.base_adj_diff[hand]![ss]![i]!; }, set(v: number) { calc.base_adj_diff[hand]![ss]![i] = v; } };
      const stam_base_cell = { get(): number { return calc.base_diff_for_stam_mod[hand]![ss]![i]!; }, set(v: number) { calc.base_diff_for_stam_mod[hand]![ss]![i] = v; } };

      // nps adjusted by pmods
      const adj_npsbase =
        calc.init_base_diff_vals[hand]![0]![i]! *
        pmod_product_cur_interval[ss]! *
        basescalers[ss]!;

      // start diff values at adjusted nps base
      adj_diff_cell.set(adj_npsbase);
      stam_base_cell.set(adj_npsbase);
      switch (ss) {
        // do funky special case stuff here
        case Skillset.Stream:
          break;

        /* test calculating stam for js/hs on max js/hs diff, also we
         * want hs to count against js so they are mutually exclusive */
        case Skillset.Jumpstream: {
          adj_diff_cell.set(
            adj_diff_cell.get() /
              Math.max(calc.pmod_vals[hand]![CalcPatternMod.HS]![i]!, 1.0),
          );
          adj_diff_cell.set(
            adj_diff_cell.get() /
              fastsqrt(calc.pmod_vals[hand]![CalcPatternMod.OHJumpMod]![i]! * 0.95),
          );

          const a = adj_diff_cell.get();
          const b =
            calc.init_base_diff_vals[hand]![0]![i]! *
            pmod_product_cur_interval[Skillset.Handstream]!;
          stam_base_cell.set(Math.max(a, b));
          break;
        }
        case Skillset.Handstream: {
          const a = adj_npsbase;
          const b =
            calc.init_base_diff_vals[hand]![0]![i]! *
            pmod_product_cur_interval[Skillset.Jumpstream]!;
          stam_base_cell.set(Math.max(a, b));
          break;
        }
        case Skillset.JackSpeed:
          break;
        case Skillset.Chordjack:
          break;
        case Skillset.Technical:
          adj_diff_cell.set(
            (calc.init_base_diff_vals[hand]![4]![i]! *
              pmod_product_cur_interval[ss]! *
              basescalers[ss]!) /
              Math.max(
                fastpow(calc.pmod_vals[hand]![CalcPatternMod.CJ]![i]! + 0.05, 2.0),
                1.0,
              ),
          );
          adj_diff_cell.set(
            adj_diff_cell.get() *
              fastsqrt(calc.pmod_vals[hand]![CalcPatternMod.OHJumpMod]![i]!),
          );
          break;
        default:
          break;
      }
    }
  }
}

function TotalMaxPoints(calc: Calc): number {
  let MaxPoints = 0;
  for (let i = 0; i < calc.numitv; i++) {
    MaxPoints += calc.itv_points[hands.left_hand]![i]! + calc.itv_points[hands.right_hand]![i]!;
  }
  return MaxPoints;
}

/** I am ulbu, the great bazoinkazoink in the sky, and ulbu does everything, for
 * ulbu is all. Praise ulbu. */
export class TheGreatBazoinkazoinkInTheSky {
  _calc: Calc;
  hand = 0;

  // keeps track of occurrences of basic row based sequencing
  _mitvi = new metaItvInfo();

  // meta row info keeps track of basic pattern sequencing as we scan down
  // the notedata rows
  _last_mri = new metaRowInfo();
  _mri = new metaRowInfo();

  // tracks meta hand info as well as basic interval tracking data for hand
  // dependent stuff
  _mitvhi = new metaItvHandInfo();

  _last_mhi = new metaHandInfo();
  _mhi = new metaHandInfo();

  _seq = new SequencerGeneral();

  // so we can make pattern mods with these
  _s = new StreamMod();
  _js = new JSMod();
  _hs = new HSMod();
  _cj = new CJMod();
  _cjd = new CJDensityMod();
  _hsd = new HSDensityMod();
  _ohj = new OHJumpModGuyThing();
  _cjohj = new CJOHJumpMod();
  _roll = new RollMod();
  _rolljs = new RollJSMod();
  _bal = new BalanceMod();
  _oht = new OHTrillMod();
  _voht = new VOHTrillMod();
  _ch = new ChaosMod();
  _chain = new CJOHAnchorMod();
  _rm = new RunningManMod();
  _mj = new MinijackMod();
  _wrb = new WideRangeBalanceMod();
  _wrr = new WideRangeRollMod();
  _wrjt = new WideRangeJumptrillMod();
  _wrjj = new WideRangeJJMod();
  _wra = new WideRangeAnchorMod();
  _fj = new FlamJamMod();
  _tt = new TheThingLookerFinderThing();
  _tt2 = new TheThingLookerFinderThing2();

  _diffz = new diffz();

  constructor(calc: Calc) {
    this._calc = calc;
  }

  operator(): void {
    this.hand = 0;

    // should redundant but w.e not sure
    this.full_hand_reset();
    this.full_agnostic_reset();
    this.reset_row_sequencing();

    this.run_agnostic_pmod_loop();
    this.run_dependent_pmod_loop();
  }

  // ---------- hand agnostic pmod loop ----------

  advance_agnostic_sequencing(): void {
    this._s.advance_sequencing(this._mri.ms_now, this._mri.notes);
    this._fj.advance_sequencing(this._mri.ms_now, this._mri.notes);
    this._tt.advance_sequencing(this._mri.ms_now, this._mri.notes);
    this._tt2.advance_sequencing(this._mri.ms_now, this._mri.notes);
  }

  setup_agnostic_pmods(): void {
    this._s.setup();
    this._fj.setup();
    this._tt.setup();
    this._tt2.setup();
  }

  full_agnostic_reset(): void {
    this._s.full_reset();
    this._js.full_reset();
    this._hs.full_reset();
    this._cj.full_reset();

    this._mri.reset();
    this._last_mri.reset();
  }

  set_agnostic_pmods(itv: number): void {
    const calc = this._calc;
    PatternMods.set_agnostic(this._s._pmod, this._s.operator(this._mitvi), itv, calc);
    PatternMods.set_agnostic(this._js._pmod, this._js.operator(this._mitvi), itv, calc);
    PatternMods.set_agnostic(this._hs._pmod, this._hs.operator(this._mitvi), itv, calc);
    PatternMods.set_agnostic(this._cj._pmod, this._cj.operator(this._mitvi), itv, calc);
    PatternMods.set_agnostic(this._cjd._pmod, this._cjd.operator(this._mitvi), itv, calc);
    PatternMods.set_agnostic(this._hsd._pmod, this._hsd.operator(this._mitvi), itv, calc);
    PatternMods.set_agnostic(this._fj._pmod, this._fj.operator(), itv, calc);
    PatternMods.set_agnostic(this._tt._pmod, this._tt.operator(), itv, calc);
    PatternMods.set_agnostic(this._tt2._pmod, this._tt2.operator(), itv, calc);
  }

  run_agnostic_pmod_loop(): void {
    this.setup_agnostic_pmods();

    const calc = this._calc;
    for (let itv = 0; itv < calc.numitv; ++itv) {
      for (let row = 0; row < calc.itv_size[itv]!; ++row) {
        const ri = calc.adj_ni[itv]![row]!;
        this._mri.operator(
          this._last_mri,
          this._mitvi,
          ri.row_time,
          ri.row_count,
          ri.row_notes,
        );

        this.advance_agnostic_sequencing();

        // swap the one we just built into last and recycle the two pointers
        const tmp = this._mri;
        this._mri = this._last_mri;
        this._last_mri = tmp;
      }

      // run pattern mod generation for hand agnostic mods
      this.set_agnostic_pmods(itv);

      // reset any accumulated interval info and set cur index number
      this._mitvi.handle_interval_end();
    }

    PatternMods.run_agnostic_smoothing_pass(calc.numitv, calc);

    // copy left -> right for agnostic mods
    PatternMods.bruh_they_the_same(calc.numitv, calc);
  }

  // ---------- hand dependent pmod loop ----------

  handle_row_dependent_pattern_advancement(row_time: number): void {
    const mhi = this._mhi;
    const seq = this._seq;
    this._ohj.advance_sequencing(mhi._ct, mhi._bt);
    this._cjohj.advance_sequencing(mhi._ct, mhi._bt);
    this._chain.advance_sequencing(
      mhi._ct,
      mhi._bt,
      mhi._last_ct,
      seq._mw_any_ms.get_now(),
    );
    this._oht.advance_sequencing(mhi._mt, seq._mw_any_ms);
    this._voht.advance_sequencing(mhi._mt, seq._mw_any_ms);
    this._rm.advance_sequencing(mhi._ct, mhi._bt, mhi._mt, seq._as);
    this._wrr.advance_sequencing(
      mhi._bt,
      mhi._mt,
      mhi._last_mt,
      seq._mw_any_ms.get_now(),
      seq.get_sc_ms_now(mhi._ct),
    );
    this._wrjt.advance_sequencing(mhi._bt, mhi._mt, mhi._last_mt, seq._mw_any_ms);
    this._wrjj.advance_sequencing(mhi._ct, row_time);
    this._ch.advance_sequencing(seq._mw_any_ms);
    this._roll.advance_sequencing(mhi._ct, row_time);
    this._rolljs.advance_sequencing(mhi._ct, row_time);
    this._mj.advance_sequencing(mhi._ct, seq.get_sc_ms_now(mhi._ct));
  }

  setup_dependent_mods(): void {
    this._oht.setup();
    this._voht.setup();
    this._roll.setup();
    this._rolljs.setup();
    this._rm.setup();
    this._wrr.setup();
    this._wrjt.setup();
    this._wrjj.setup();
    this._wrb.setup();
    this._wra.setup();
  }

  set_dependent_pmods(itv: number): void {
    const calc = this._calc;
    const hand = this.hand;
    const mitvhi = this._mitvhi;
    PatternMods.set_dependent(hand, this._ohj._pmod, this._ohj.operator(mitvhi), itv, calc);
    PatternMods.set_dependent(hand, this._chain._pmod, this._chain.operator(mitvhi), itv, calc);
    PatternMods.set_dependent(hand, this._cjohj._pmod, this._cjohj.operator(mitvhi), itv, calc);
    PatternMods.set_dependent(hand, this._oht._pmod, this._oht.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(hand, this._voht._pmod, this._voht.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(hand, this._bal._pmod, this._bal.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(hand, this._roll._pmod, this._roll.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(hand, this._rolljs._pmod, this._rolljs.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(
      hand,
      this._ch._pmod,
      this._ch.operator(mitvhi._itvhi.get_taps_nowi()),
      itv,
      calc,
    );
    PatternMods.set_dependent(
      hand,
      this._rm._pmod,
      this._rm.operator(mitvhi._itvhi.get_taps_nowi()),
      itv,
      calc,
    );
    PatternMods.set_dependent(hand, this._wrb._pmod, this._wrb.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(hand, this._wrr._pmod, this._wrr.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(hand, this._wrjt._pmod, this._wrjt.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(hand, this._wrjj._pmod, this._wrjj.operator(mitvhi._itvhi), itv, calc);
    PatternMods.set_dependent(
      hand,
      this._wra._pmod,
      this._wra.operator(mitvhi._itvhi, this._seq._as),
      itv,
      calc,
    );
    PatternMods.set_dependent(hand, this._mj._pmod, this._mj.operator(mitvhi._itvhi), itv, calc);
  }

  /** reset any moving windows or values when starting the other hand */
  full_hand_reset(): void {
    this._ohj.full_reset();
    this._chain.full_reset();
    this._cjohj.full_reset();
    this._bal.full_reset();
    this._roll.full_reset();
    this._rolljs.full_reset();
    this._oht.full_reset();
    this._voht.full_reset();
    this._ch.full_reset();
    this._rm.full_reset();
    this._wrr.full_reset();
    this._wrjt.full_reset();
    this._wrjj.full_reset();
    this._wrb.full_reset();
    this._wra.full_reset();
    this._mj.full_reset();

    this._seq.full_reset();
    this._mitvhi.zero();
    this._mhi.full_reset();
    this._last_mhi.full_reset();
    this._diffz.full_reset();
  }

  reset_row_sequencing(): void {
    this._mitvi.reset();
  }

  handle_dependent_interval_end(itv: number): void {
    /* this calls itvhi's interval end, which is what updates the hand
     * counts, so this _must_ be called before anything else */
    this._mitvhi.interval_end();

    // same thing but for anchor max!!!
    this._seq.interval_end();

    // run pattern mod generation for hand dependent mods
    this.set_dependent_pmods(itv);

    // run sequenced base difficulty generation
    this.set_sequenced_base_diffs(itv);

    this._diffz.interval_end();
  }

  update_sequenced_base_diffs(
    ct: col_type,
    itv: number,
    jack_counter: number,
    row_time: number,
    any_ms: number,
  ): void {
    void itv;
    void jack_counter;
    const calc = this._calc;
    const hand = this.hand;

    let jack_diff_val =
      ms_to_scaled_nps(this._seq._as.get_lowest_jack_ms()) * basescalers[Skillset.JackSpeed]!;
    if (Number.isNaN(jack_diff_val)) {
      jack_diff_val = 0.0;
    }
    // jack speed updates with highest anchor difficulty seen
    // _between either column_ for _this row_
    calc.jack_diff[hand]!.push([row_time, jack_diff_val]);

    // chordjack updates
    this._diffz._cj.advance_base(any_ms, calc);

    // tech updates with a convoluted mess of garbage
    this._diffz._tc.advance_base(this._seq, ct, calc, hand, row_time);
    this._diffz._tc.advance_rm_comp(this._rm.get_highest_anchor_difficulty());
    this._diffz._tc.advance_jack_comp(this._seq._as.get_lowest_jack_ms());
  }

  set_sequenced_base_diffs(itv: number): void {
    void itv;
    const calc = this._calc;
    const hand = this.hand;

    calc.init_base_diff_vals[hand]![2]![itv] = this._diffz._tc.jack_itv_diff; // JackBase

    calc.init_base_diff_vals[hand]![3]![itv] = this._diffz._cj.get_itv_diff(calc); // CJBase

    // kinda jank but includes a weighted average vs nps base to prevent
    // really silly stuff from becoming outliers
    calc.init_base_diff_vals[hand]![4]![itv] = this._diffz._tc.get_itv_diff(
      calc.init_base_diff_vals[hand]![0]![itv]!,
      calc,
    ); // TechBase

    calc.init_base_diff_vals[hand]![5]![itv] = this._diffz._tc.rm_itv_max_diff; // RMABase
  }

  run_dependent_pmod_loop(): void {
    const calc = this._calc;
    this.setup_dependent_mods();

    for (const ids of hand_col_ids) {
      let row_time = s_init;
      let last_row_time = s_init;
      let any_ms = ms_init;

      this.full_hand_reset();

      // arrays are super bug prone with jacks so try vectors for now
      calc.jack_diff[this.hand] = [];

      nps.actual_cancer(calc, this.hand);

      Smooth(calc.init_base_diff_vals[this.hand]![0]!, 0.0, calc.numitv);
      MSSmooth(calc.init_base_diff_vals[this.hand]![1]!, 0.0, calc.numitv);

      for (let itv = 0; itv < calc.numitv; ++itv) {
        let jack_counter = 0;
        for (let row = 0; row < calc.itv_size[itv]!; ++row) {
          const ri = calc.adj_ni[itv]![row]!;
          row_time = ri.row_time;
          const row_notes = ri.row_notes;
          const row_count = ri.row_count;

          // don't like having this here
          any_ms = ms_from(row_time, last_row_time);

          const ct = determine_col_type(row_notes, ids);

          // cj must always update
          this._diffz._cj.update_flags(row_notes, row_count);

          // handle any special cases that need to be executed on empty rows
          // for this hand here before moving on
          if (ct === col_type.col_empty) {
            this._rm.advance_off_hand_sequencing();
            this._mj.advance_off_hand_sequencing();
            if (row_count === 2) {
              this._rm.advance_off_hand_sequencing();
            }
            continue;
          }

          // basically a time master, keeps track of different timings,
          // update first
          this._seq.advance_sequencing(ct, row_time, any_ms);

          // update metahandinfo
          this._mhi.operator(this._last_mhi, ct);

          // update interval aggregation of column taps
          this._mitvhi._itvhi.set_col_taps(ct);

          // advance sequencing for all hand dependent mods
          this.handle_row_dependent_pattern_advancement(row_time);

          /* jackspeed, and tech use various adjust ms bases that are
           * sequenced here, meaning they are order dependent */
          this.update_sequenced_base_diffs(ct, itv, jack_counter, row_time, any_ms);
          ++jack_counter;

          // only ohj uses this atm (and probably into the future)
          if (this._mhi._bt !== base_type.base_type_init) {
            ++this._mitvhi._base_types[this._mhi._bt]!;
            ++this._mitvhi._meta_types[this._mhi._mt]!;
          }

          // cycle the pointers so now becomes last
          const tmp = this._mhi;
          this._mhi = this._last_mhi;
          this._last_mhi = tmp;
          last_row_time = row_time;
        }

        this.handle_dependent_interval_end(itv);
      }
      PatternMods.run_dependent_smoothing_pass(calc.numitv, calc);

      // ok this is pretty jank LOL, just increment the hand index
      // when we finish left hand
      ++this.hand;
    }

    nps.grindscale(calc);
  }
}

function InitializeHands(ni: readonly NoteInfo[], music_rate: number, offset: number, calc: Calc): boolean {
  // do we skip this file?
  if (fast_walk_and_check_for_skip(ni, music_rate, calc, offset)) return true;

  // ulbu calculates everything needed for the block below
  // (mostly patternmods)
  const ulbu = new TheGreatBazoinkazoinkInTheSky(calc);

  // reset ulbu patternmod structs
  // run agnostic patternmod/sequence loop
  // run dependent patternmod/sequence loop
  ulbu.operator();

  // loop over hands to set adjusted difficulties using the patternmods
  for (const hand of both_hands) {
    InitAdjDiff(calc, hand);
  }

  return false;
}

/** MinaCalc.cpp CalcMain — returns the 8 skillset values. */
export function CalcMain(
  ni: readonly NoteInfo[],
  music_rate: number,
  score_goal: number,
  calc: Calc,
): number[] {
  // for multi offset passes
  const num_offset_passes = 1;
  const all_skillset_values: number[][] = [];
  for (let cur_iteration = 0; cur_iteration < num_offset_passes; ++cur_iteration) {
    const skip = InitializeHands(ni, music_rate, 0.1 * cur_iteration, calc);

    // if we exceed max_rows_for_single_interval during processing
    if (skip) {
      return dimples_the_all_zero_output();
    }

    calc.MaxPoints = TotalMaxPoints(calc);
    const iteration_skillet_values = new Array<number>(NUM_SKILLSET).fill(0.0);

    // overall and stam will be left as 0.f by this loop
    for (let i = 0; i < NUM_SKILLSET; ++i) {
      iteration_skillet_values[i] = Chisel(calc, 0.1, 10.24, score_goal, i, false);
    }

    // stam is based on which calc produced the highest output without it
    const highest_base_skillset = max_index(iteration_skillet_values);
    const base = iteration_skillet_values[highest_base_skillset]!;

    /* rerun all with stam on, starting at the non-stam adjusted base
     * value for each skillset */
    for (let i = 0; i < NUM_SKILLSET; ++i) {
      if (iteration_skillet_values[i]! > base * 0.9) {
        iteration_skillet_values[i] = Chisel(
          calc,
          iteration_skillet_values[i]! * 0.9,
          0.32,
          score_goal,
          i,
          true,
        );
      }
    }

    const highest_stam_adjusted_skillset = max_index(iteration_skillet_values);

    let highest_stam_adj_ss_value = iteration_skillet_values[highest_stam_adjusted_skillset]!;

    if (highest_stam_adjusted_skillset === Skillset.JackSpeed) {
      highest_stam_adj_ss_value *= 0.8;
    }

    const stam_curve_shift = 0.015;
    // ends up being a multiplier between ~0.8 and ~1
    let stam_adj_mult = Math.pow(
      highest_stam_adj_ss_value / base - stam_curve_shift,
      2.5,
    );

    stam_adj_mult = clamp(stam_adj_mult, 0.8, 1.08);
    iteration_skillet_values[Skillset.Stamina] =
      highest_stam_adj_ss_value * stam_adj_mult * basescalers[Skillset.Stamina]!;

    /* the final push down, cap ssrs (score specific ratings) */
    if (calc.ssr) {
      const ssrcap = 40.0;
      for (let i = 0; i < iteration_skillet_values.length; i++) {
        // so 50%s on 60s don't give 35s
        let r = downscale_low_accuracy_scores(iteration_skillet_values[i]!, score_goal);
        r = Math.min(r, ssrcap);

        if (highest_stam_adjusted_skillset === Skillset.JackSpeed) {
          r = downscale_low_accuracy_scores(r, score_goal);
        }
        iteration_skillet_values[i] = r;
      }
    }

    /* finished all modifications to skillset values, set overall using
     * sigmoidal aggregation, but only let it buff files */
    const agg = aggregate_skill(iteration_skillet_values, 0.25, 1.11, 0.0, 10.24);
    let highest = -1.0;
    for (const v of iteration_skillet_values) if (v > highest) highest = v;
    iteration_skillet_values[Skillset.Overall] = agg > highest ? agg : highest;

    all_skillset_values.push(iteration_skillet_values);
  }

  // final output is the average of all skillset values of all iterations
  // also applies the grindscaler
  const output = new Array<number>(NUM_SKILLSET).fill(0.0);
  for (let i = 0; i < NUM_SKILLSET; ++i) {
    let acc = 0.0;
    for (const vals of all_skillset_values) acc += vals[i]!;
    output[i] = acc / all_skillset_values.length;
  }

  // lighten grindscaler for jack files only
  let highest_final_ss: number = Skillset.Overall;
  let highest_final_ssv = -1.0;
  for (let i = 0; i < output.length; i++) {
    if (i === Skillset.Overall) continue;
    if (output[i]! > highest_final_ssv) {
      highest_final_ss = i;
      highest_final_ssv = output[i]!;
    }
  }
  if (calc.ssr) {
    if (highest_final_ss === Skillset.JackSpeed || highest_final_ss === Skillset.Chordjack) {
      calc.grindscaler = fastsqrt(calc.grindscaler);
    }
    for (let i = 0; i < output.length; i++) output[i] = output[i]! * calc.grindscaler;
  }
  return output;
}

function dimples_the_all_zero_output(): number[] {
  return new Array<number>(NUM_SKILLSET).fill(min_rating);
}

/** MinaSDCalc — score-based skillset values (SSR path). */
export function MinaSDCalc(
  ni: readonly NoteInfo[],
  musicrate: number,
  goal: number,
  calc: Calc,
): number[] {
  if (ni.length <= 1) {
    return dimples_the_all_zero_output();
  }
  calc.ssr = true;

  return CalcMain(ni, musicrate, Math.min(goal, ssr_goal_cap), calc);
}

void low_acc_cutoff;
void max_intervals;
void max_rows_for_single_interval;
