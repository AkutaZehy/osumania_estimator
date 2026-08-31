// Port of Etterna 0.72.3 CJ.h

import { CalcPatternMod, neutral } from "../enums.js";
import { clamp, fastsqrt } from "../num.js";
import { metaItvInfo } from "./MetaIntervalInfo.js";

/// Hand-Agnostic PatternMod detecting Chordjacks.
/// Looks for continuous chords which form jacks
export class CJMod {
  readonly _pmod: CalcPatternMod = CalcPatternMod.CJ;
  // const std::vector<CalcPatternMod> _dbg = { CJS, CJJ };
  readonly name = "CJMod";

  // #pragma region params

  min_mod = 0.6;
  max_mod = 1.0;
  mod_base = 0.4;
  prop_buffer = 1.0;

  total_prop_min = this.min_mod;
  total_prop_max = this.max_mod;
  total_prop_scaler = 5.428;

  jack_base = 2.0;
  jack_min = 0.625;
  jack_max = 1.0;
  jack_scaler = 1.0;

  not_jack_pool = 1.2;
  not_jack_min = 0.4;
  not_jack_max = 1.0;
  not_jack_scaler = 1.0;

  vibro_flag = 1.0;
  decay_factor = 0.1;

  // #pragma endregion params and param map

  total_prop = 0.0;
  jack_prop = 0.0;
  not_jack_prop = 0.0;
  pmod = this.min_mod;
  t_taps = 0.0;
  last_mod = 0.0;

  full_reset(): void {
    this.last_mod = this.min_mod;
  }

  decay_mod(): void {
    this.pmod = clamp(this.last_mod - this.decay_factor, this.min_mod, this.max_mod);
    this.last_mod = this.pmod;
  }

  // inline void set_dbg(std::vector<float> doot[], const int& i)
  //{
  //	doot[CJS][i] = not_jack_prop;
  //	doot[CJJ][i] = jack_prop;
  //}

  operator(mitvi: metaItvInfo): number {
    const itvi = mitvi._itvi;

    if (itvi.total_taps === 0) {
      return neutral;
    }

    // no chords
    if (itvi.chord_taps === 0) {
      this.decay_mod();
      return this.pmod;
    }

    this.t_taps = itvi.total_taps;

    // we have at least 1 chord we want to give a little leeway for single
    // taps but not too much or sections of [12]4[123] [123]4[23] will be
    // flagged as chordjack when they're really just broken chordstream, and
    // we also want to give enough leeway so that hyperdense chordjacks at
    // lower bpms aren't automatically rated higher than more sparse jacks
    // at higher bpms
    this.total_prop =
      ((itvi.chord_taps + this.prop_buffer) /
        (this.t_taps - this.prop_buffer)) *
      this.total_prop_scaler;
    this.total_prop = clamp(
      fastsqrt(this.total_prop),
      this.total_prop_min,
      this.total_prop_max,
    );

    // make sure there's at least a couple of jacks
    this.jack_prop = clamp(
      mitvi.actual_jacks_cj - this.jack_base,
      this.jack_min,
      this.jack_max,
    );

    // explicitly detect broken chordstream type stuff so we can give more
    // leeway to single note jacks brop_two_return_of_brop_electric_bropaloo
    this.not_jack_prop = clamp(
      this.not_jack_pool -
        (mitvi.definitely_not_jacks * this.not_jack_scaler) / this.t_taps,
      this.not_jack_min,
      this.not_jack_max,
    );

    this.pmod = clamp(
      this.total_prop * this.jack_prop * this.not_jack_prop,
      this.min_mod,
      this.max_mod,
    );

    // ITS JUST VIBRO THEN(unique note permutations per interval < 3 ), use
    // this other places ?
    if (mitvi.basically_vibro) {
      if (mitvi.num_var === 1) {
        this.pmod *= 0.5 * this.vibro_flag;
      } else if (mitvi.num_var === 2) {
        this.pmod *= 0.9 * this.vibro_flag;
      } else if (mitvi.num_var === 3) {
        this.pmod *= 0.95 * this.vibro_flag;
      }
    }

    // set for decay
    this.last_mod = this.pmod;

    return this.pmod;
  }
}
