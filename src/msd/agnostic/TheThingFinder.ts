// Port of Etterna 0.72.3 TheThingFinder.h

import { CalcPatternMod } from "../enums.js";
import { clamp } from "../num.js";
import { TT_Sequencing, TT_Sequencing2 } from "./ThingSequencing.js";

/// Hand-Agnostic PatternMod detecting rolly Jumpstream.
/// Looks for continuous segments of a pattern with jumps
/// which physically plays as a jumptrill or a mashed roll.
///
/// dev note:
/// probably add a timing check to this as well
export class TheThingLookerFinderThing {
  readonly _pmod: CalcPatternMod = CalcPatternMod.TheThing;
  readonly name = "TheThingMod";

  // #pragma region params

  min_mod = 0.15;
  max_mod = 1.0;
  base = 0.05;

  // params for tt_sequencing
  group_tol = 35.0;
  step_tol = 17.5;
  scaler = 0.2;

  // #pragma endregion params and param map

  // sequencer
  tt = new TT_Sequencing();
  pmod = this.min_mod;

  // #pragma region generic functions
  setup(): void {
    this.tt.set_params(this.group_tol, this.step_tol, this.scaler);
  }

  // #pragma endregion

  advance_sequencing(ms_now: number, notes: number): void {
    this.tt.operator(ms_now, notes);
  }

  operator(): number {
    this.pmod =
      this.tt.mod_parts[0]! +
      this.tt.mod_parts[1]! +
      this.tt.mod_parts[2]! +
      this.tt.mod_parts[3]!;
    this.pmod /= 4.0;
    this.pmod = clamp(this.base + this.pmod, this.min_mod, this.max_mod);

    // reset flags n stuff
    this.tt.reset();

    return this.pmod;
  }
}

/// Hand-Agnostic PatternMod detecting rolly Jumpstream.
/// Looks for continuous segments of a pattern with jumps
/// which physically plays as a jumptrill or a mashed roll.
///
/// dev note:
/// probably add a timing check to this as well
export class TheThingLookerFinderThing2 {
  readonly _pmod: CalcPatternMod = CalcPatternMod.TheThing2;
  readonly name = "TheThing2Mod";

  // #pragma region params

  min_mod = 0.15;
  max_mod = 1.0;
  base = 0.05;

  // params for tt_sequencing
  group_tol = 35.0;
  step_tol = 17.5;
  scaler = 0.2;

  // #pragma endregion params and param map

  // sequencer
  tt2 = new TT_Sequencing2();
  pmod = this.min_mod;

  // #pragma region generic functions
  setup(): void {
    this.tt2.set_params(this.group_tol, this.step_tol, this.scaler);
  }

  // #pragma endregion

  advance_sequencing(ms_now: number, notes: number): void {
    this.tt2.operator(ms_now, notes);
  }

  operator(): number {
    this.pmod =
      this.tt2.mod_parts[0]! +
      this.tt2.mod_parts[1]! +
      this.tt2.mod_parts[2]! +
      this.tt2.mod_parts[3]!;
    this.pmod /= 4.0;
    this.pmod = clamp(this.base + this.pmod, this.min_mod, this.max_mod);

    // reset flags n stuff
    this.tt2.reset();

    return this.pmod;
  }
}
