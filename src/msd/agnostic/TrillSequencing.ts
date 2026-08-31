// Port of Etterna 0.72.3 TrillSequencing.h
//
// NOTE: upstream this file includes ../Dependent/HD_BasicSequencing.h for
// `determine_col_type`. The dependent layer is not ported here, so that
// helper is duplicated verbatim at the bottom of this file (kept as the
// canonical agnostic-side copy until the dependent layer lands).

import { col_type, hands } from "../enums.js";
import { clamp, weighted_average } from "../num.js";
import { max_moving_window_size, CalcMovingWindow } from "../window.js";
import { metaItvInfo } from "./MetaIntervalInfo.js";

/** Exact numeric layout of C++ `enum trillnario` (twohandtrill, TrillSequencing.h). */
export const trillnario = {
  the_lack_thereof: 0, // empty state
  need_opposite: 1,
} as const;
export type trillnario = (typeof trillnario)[keyof typeof trillnario];

export class twohandtrill {
  // trill scenarios
  static readonly trillnario = trillnario;

  // for the trill to continue, the next note must be on the opposite hand
  current_hand: hands = hands.left_hand;
  // for the trill to continue, the left hand notes must be on this column
  // allow for ohj
  left_hand_state: col_type = col_type.col_init;
  // for the trill to continue, the right hand notes must be on this column
  // allow for ohj
  right_hand_state: col_type = col_type.col_init;

  current_scenario: trillnario = trillnario.the_lack_thereof;

  /// a trill length 1 is 2 notes long and has "completed"
  cur_length = 0;
  jump_count = 0;

  trill_ms = new CalcMovingWindow<number>();
  trills_in_interval = 0;
  total_taps = 0;

  // trill ms cv greater than this is rejected
  cv_threshold = 0.5;

  last_notes = 0b0000;
  last_last_notes = 0b0000;

  // true if is a hand or two hand jump
  two_hand_jump(notes: number): boolean {
    return (notes & 0b1100) !== 0 && (notes & 0b0011) !== 0;
  }

  // drive the sequencer
  process(ms_now: number, notes: number): void {
    // (left uninitialized upstream; every use is preceded by assignment)
    let notes_hand: hands = hands.left_hand;
    let notes_coltype: col_type = col_type.col_init;
    const prev_notes = this.last_notes;
    const prev_prev_notes = this.last_last_notes;
    this.last_last_notes = this.last_notes;
    this.last_notes = notes;

    if (this.two_hand_jump(notes)) {
      if (this.two_hand_jump(prev_notes)) {
        // absolutely not
        this.dead_trill();
        return;
      }
      if (this.two_hand_jump(prev_prev_notes)) {
        // basically not a two hand trill
        this.dead_trill();
        return;
      }

      if ((notes & 0b1111) === 0b1111) {
        // quad
        this.dead_trill();
        return;
      } else if ((notes & 0b1100) === 0b1100) {
        // jump on left
        // notes_coltype = determine_col_type(notes, 0b0011);
        notes_hand = hands.left_hand;
        notes_coltype = col_type.col_ohjump;
      } else if ((notes & 0b0011) === 0b0011) {
        // jump on right
        // notes_coltype = determine_col_type(notes, 0b1100);
        notes_hand = hands.right_hand;
        notes_coltype = col_type.col_ohjump;
      } else {
        // actual two hand jump
        if ((notes & prev_prev_notes) !== 0 && (notes & prev_notes) === 0) {
          // a jack separated by a note
          // current row doesnt form a jack with previous row
          // (23[24])
          // find the jack column and hand
          const ppn = notes & prev_prev_notes;
          if ((ppn & 0b1100) !== 0) {
            notes_hand = hands.left_hand;
            notes_coltype = determine_col_type(notes, 0b1100);
          } else if ((ppn & 0b0011) !== 0) {
            notes_hand = hands.right_hand;
            notes_coltype = determine_col_type(notes, 0b0011);
          } else {
            // preposterous
            this.dead_trill();
            return;
          }
        } else {
          // what (232[24])
          this.dead_trill();
          return;
        }
      }
    } else if ((notes & 0b1100) !== 0) {
      notes_hand = hands.left_hand;
      notes_coltype = determine_col_type(notes, 0b1100);
    } else if ((notes & 0b0011) !== 0) {
      notes_hand = hands.right_hand;
      notes_coltype = determine_col_type(notes, 0b0011);
    } else {
      // there is a lack of taps.
      // this typically doesnt happen
      this.reset();
      return;
    }

    switch (this.current_scenario) {
      case twohandtrill.trillnario.the_lack_thereof: {
        // begin a trill anywhere
        this.current_hand = notes_hand;
        this.set_hand_states(notes_coltype);
        this.current_scenario = twohandtrill.trillnario.need_opposite;
        break;
      }
      case twohandtrill.trillnario.need_opposite: {
        if (this.current_hand === notes_hand) {
          // trill broken
          this.dead_trill();
        } else {
          if (notes_coltype === col_type.col_ohjump) {
            ++this.jump_count;
          }
          if (this.current_hand === hands.left_hand) {
            if (
              this.right_hand_state === col_type.col_init ||
              this.right_hand_state === notes_coltype
            ) {
              this.right_hand_state = notes_coltype;
              this.calc_trill(ms_now);
              ++this.cur_length;
              ++this.total_taps;
            } else {
              // trill broken
              this.dead_trill();
              this.right_hand_state = notes_coltype;
              this.current_scenario = twohandtrill.trillnario.need_opposite;
            }
          } else {
            if (
              this.left_hand_state === col_type.col_init ||
              this.left_hand_state === notes_coltype
            ) {
              this.left_hand_state = notes_coltype;
              this.calc_trill(ms_now);
              ++this.cur_length;
              ++this.total_taps;
            } else {
              // trill broken
              this.dead_trill();
              this.left_hand_state = notes_coltype;
              this.current_scenario = twohandtrill.trillnario.need_opposite;
            }
          }
        }
        break;
      }
      default:
        // assert(0) upstream (no-op in release builds)
        break;
    }
  }

  set_hand_states(coltype: col_type): void {
    if (this.current_hand === hands.left_hand) {
      this.left_hand_state = coltype;
    } else {
      this.right_hand_state = coltype;
    }
  }

  calc_trill(ms_now: number): boolean {
    const window = Math.min(this.cur_length, max_moving_window_size);
    this.trill_ms.operator(ms_now);
    // float cv = trill_ms.get_cv_of_window(window);
    // for high cv, this may be a flam
    void window; // unused upstream (cv check disabled)
    return true;
    // return cv < this.cv_threshold;
  }

  reset(): void {
    this.trills_in_interval = 0;
    this.total_taps = 0;
    this.cur_length = 0;
    this.trill_ms.zero();
    this.current_scenario = twohandtrill.trillnario.the_lack_thereof;
    this.left_hand_state = col_type.col_init;
    this.right_hand_state = col_type.col_init;
    this.last_notes = 0b0000;
    this.last_last_notes = 0b0000;
  }

  dead_trill(): void {
    this.cur_length = 0;
    this.trill_ms.zero();
    this.current_scenario = twohandtrill.trillnario.the_lack_thereof;
    this.left_hand_state = col_type.col_init;
    this.right_hand_state = col_type.col_init;
    this.last_notes = 0b0000;
    this.last_last_notes = 0b0000;
  }
}

/// Two Hand Trill Sequencing
export class THT_Sequencing {
  trill = new twohandtrill();

  readonly _tap_size = 1;
  readonly _jump_size = 2;

  trill_buffer = 0.0;
  trill_scaler = 1.0;
  jump_buffer = 0.0;
  jump_scaler = 1.0;
  jump_weight = 0.5;

  min_val = 0.0;
  max_val = 1.5;

  set_params(
    cv: number,
    tbuffer: number,
    tscaler: number,
    jbuffer: number,
    jscaler: number,
    jweight: number,
    min: number,
    max: number,
  ): void {
    this.trill.cv_threshold = cv;
    this.trill_buffer = tbuffer;
    this.trill_scaler = tscaler;
    this.jump_buffer = jbuffer;
    this.jump_scaler = jscaler;
    this.jump_weight = jweight;
    this.min_val = min;
    this.max_val = max;
  }

  // advance sequencing
  operator(ms_now: number, notes: number): void {
    this.trill.process(ms_now, notes);
  }

  reset(): void {
    this.trill.reset();
  }

  /// numerical output (kind of like a proportion. 1 is "all trills")
  get(mitvi: metaItvInfo): number {
    const trill_taps = this.trill.total_taps;
    const trill_jumps = this.trill.jump_count;
    const itvi = mitvi._itvi;
    const taps = itvi.total_taps;

    if (taps === 0.0) {
      return 0.0;
    }

    const jumps = itvi.taps_by_size[this._jump_size]!;

    const trill_proportion =
      ((trill_taps + this.trill_buffer) / Math.max(taps - this.trill_buffer, 1.0)) *
      this.trill_scaler;

    const jump_proportion =
      ((jumps - trill_jumps + this.jump_buffer) / Math.max(taps - this.jump_buffer, 1.0)) *
      this.jump_scaler;

    // jump_weight = 0 will make it all jump_proportion
    const prop = weighted_average(
      trill_proportion,
      jump_proportion,
      clamp(1 - this.jump_weight, 0.0, 1.0),
      1.0,
    );

    return clamp(prop, this.min_val, this.max_val);
  }
}

/**
 * Port of determine_col_type (HD_BasicSequencing.h, dependent layer).
 * Given notes for a certain hand, tell what kind of tap it is for this hand.
 */
export function determine_col_type(notes: number, hand_id: number): col_type {
  const shirt = notes & hand_id;
  if (shirt === 0) {
    return col_type.col_empty;
  }

  if (hand_id === 3) {
    if (shirt === 3) {
      return col_type.col_ohjump;
    }
    if (shirt === 1) {
      return col_type.col_left;
    }
    if (shirt === 2) {
      return col_type.col_right;
    }
  } else if (hand_id === 12) {
    if (shirt === 12) {
      return col_type.col_ohjump;
    }
    if (shirt === 8) {
      return col_type.col_right;
    }
    if (shirt === 4) {
      return col_type.col_left;
    }
  }
  // assert(0) upstream
  return col_type.col_init;
}
