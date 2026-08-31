// Port of Etterna 0.72.3 ThingSequencing.h

// search for specific patterns that when chained together are extremely
// jumptrillable, currently detection is separated, but it should probably be
// combined

/// Struct to handle sequence logic for an instance of TheThing.
/// Pattern detected would decompose to jumptrills or something which can be
/// easily mashed.
///
/// find [xx]a[yy]b[zz]
/// used by tt_sequencer and thing 1
export class the_slip {
  static readonly to_slide_or_not_to_slide = {
    slip_unbeginninged: 0,
    needs_single: 1,
    needs_23_jump: 2,
    needs_opposing_single: 3,
    needs_opposing_ohjump: 4,
    slip_complete: 5,
  } as const;

  /// what caused us to slip
  slip = 0;
  /// are we slipping
  slippin_till_ya_slips_come_true = false;
  /// how far those whomst'd've been slippinging
  slide = 0;

  // couldn't figure out how to make slip & slide work smh
  the_slip_is_the_boot(notes: number): boolean {
    switch (this.slide) {
      // just started, need single note with no jack between our starting
      // point and [23]
      case the_slip.to_slide_or_not_to_slide.needs_single: {
        // 1100 requires 0001
        if (this.slip === 3 || this.slip === 7) {
          if (notes === 8) {
            return true;
          }
        } else
          // if it's not a left hand jump, it's a right hand one, we
          // need 1000
          if (notes === 1) {
            return true;
          }
        break;
      }
      case the_slip.to_slide_or_not_to_slide.needs_23_jump: {
        // has to be [23]
        if (notes === 6) {
          return true;
        }
        break;
      }
      case the_slip.to_slide_or_not_to_slide.needs_opposing_single: {
        // same as 1 but reversed

        // 1100
        // 0001
        // 0110
        // requires 1000
        if (this.slip === 3 || this.slip === 7) {
          if (notes === 1) {
            return true;
          }
        } else
          // if it's not a left hand jump, it's a right hand one, we
          // need 0001
          if (notes === 8) {
            return true;
          }
        break;
      }
      case the_slip.to_slide_or_not_to_slide.needs_opposing_ohjump: {
        if (this.slip === 3 || this.slip === 7) {
          // if we started on 1100, we end on 0011
          // make detecc more inclusive i guess by allowing 0100
          if (notes === 12 || notes === 14) {
            return true;
          }
        } else
          // starting on 0011 ends on 1100
          // make detecc more inclusive i guess by allowing 0010
          if (notes === 3 || notes === 7) {
            return true;
          }
        break;
      }
      default:
        // assert(0) upstream (no-op in release builds)
        break;
    }
    return false;
  }

  start(ms_now: number, notes: number): void {
    this.slip = notes;
    this.slide = 0;
    this.slippin_till_ya_slips_come_true = true;
    this.grow(ms_now, notes);
  }

  grow(_ms_now /*ms_now*/: number, _notes /*notes*/: number): void {
    // ms[slide] = ms_now;
    ++this.slide;
  }

  reset(): void {
    this.slippin_till_ya_slips_come_true = false;
  }
}

/// Struct to handle sequence logic for an instance of TheThing2.
/// Pattern detected would decompose to jumptrills or something which can be
/// easily mashed.
///
/// find [12]3[24]1[34]2[13]4[12]
/// used by tt2 and thing 2
export class the_slip2 {
  static readonly to_slide_or_not_to_slide = {
    slip_unbeginninged: 0,
    needs_single: 1,
    needs_door: 2,
    needs_blaap: 3,
    needs_opposing_ohjump: 4,
    slip_complete: 5,
  } as const;

  /// what caused us to slip
  slip = 0;
  // are we slipping
  slippin_till_ya_slips_come_true = false;
  /// how far those whomst'd've been slippinging
  slide = 0;

  // couldn't figure out how to make slip & slide work smh
  the_slip_is_the_boot(notes: number): boolean {
    switch (this.slide) {
      // just started, need single note with no jack between our starting
      // point and [23]
      case the_slip2.to_slide_or_not_to_slide.needs_single: {
        // 1100 requires 0010
        if (this.slip === 3) {
          if (notes === 4) {
            return true;
          }
        } else if (notes === 2) {
          return true;
        }
        break;
      }
      case the_slip2.to_slide_or_not_to_slide.needs_door: {
        if (this.slip === 3) {
          if (notes === 10) {
            return true;
          }
        } else if (notes === 5) {
          return true;
        }
        break;
      }
      case the_slip2.to_slide_or_not_to_slide.needs_blaap: {
        // it's alive

        // requires 1000
        if (this.slip === 3) {
          if (notes === 1) {
            return true;
          }
        } else if (notes === 8) {
          return true;
        }
        break;
      }
      case the_slip2.to_slide_or_not_to_slide.needs_opposing_ohjump: {
        if (this.slip === 3) {
          // if we started on 1100, we end on 0011
          if (notes === 12) {
            return true;
          }
        } else
          // starting on 0011 ends on 1100
          if (notes === 3) {
            return true;
          }
        break;
      }
      default:
        // assert(0) upstream (no-op in release builds)
        break;
    }
    return false;
  }

  start(ms_now: number, notes: number): void {
    this.slip = notes;
    this.slide = 0;
    this.slippin_till_ya_slips_come_true = true;
    this.grow(ms_now, notes);
  }

  grow(_ms_now /*ms_now*/: number, _notes /*notes*/: number): void {
    // ms[slide] = ms_now;
    ++this.slide;
  }

  reset(): void {
    this.slippin_till_ya_slips_come_true = false;
  }
}

// sort of the same concept as fj, slightly different implementation
// used by thing1
export class TT_Sequencing {
  fizz = new the_slip();
  slip_counter = 0;
  static readonly max_slips = 4;
  mod_parts: number[] = [1.0, 1.0, 1.0, 1.0];

  scaler = 0.0;

  set_params(_gt /*gt*/: number, _st /*st*/: number, ms: number): void {
    // group_tol = gt;
    // step_tol = st;
    this.scaler = ms;
  }

  complete_slip(ms_now: number, notes: number): void {
    if (this.slip_counter < TT_Sequencing.max_slips) {
      this.mod_parts[this.slip_counter] = this.construct_mod_part();
    }
    ++this.slip_counter;

    // any time we complete a slip we can start another slip, so just
    // start again
    this.fizz.start(ms_now, notes);
  }

  // only start if we pick up ohjump or hand with an ohjump, not a quad, not
  // singles
  static start_test(notes: number): boolean {
    // either left hand jump or a hand containing left hand jump
    // or right hand jump or a hand containing right hand jump

    return notes === 3 || notes === 7 || notes === 12 || notes === 14;
  }

  operator(ms_now: number, notes: number): void {
    // ignore quads
    if (notes === 15) {
      // reset if we are in a sequence
      if (this.fizz.slippin_till_ya_slips_come_true) {
        this.fizz.reset();
      }
      return;
    }

    // haven't started
    if (!this.fizz.slippin_till_ya_slips_come_true) {
      // col check to start
      if (TT_Sequencing.start_test(notes)) {
        this.fizz.start(ms_now, notes);
      }
      return;
    }
    // run the col checks for continuation
    if (this.fizz.the_slip_is_the_boot(notes)) {
      this.fizz.grow(ms_now, notes);
      // we found... the thing
      if (this.fizz.slide === 5) {
        this.complete_slip(ms_now, notes);
      }
    } else {
      // reset if we fail col check
      this.fizz.reset();
    }
  }

  reset(): void {
    this.slip_counter = 0;
    this.mod_parts.fill(1.0);
  }

  construct_mod_part(): number {
    return this.scaler;
  }
}

// sort of the same concept as fj, slightly different implementation
// used by thing2
export class TT_Sequencing2 {
  fizz = new the_slip2();
  slip_counter = 0;
  static readonly max_slips = 4;
  mod_parts: number[] = [1.0, 1.0, 1.0, 1.0];

  scaler = 0.0;

  set_params(_gt /*gt*/: number, _st /*st*/: number, ms: number): void {
    // group_tol = gt;
    // step_tol = st;
    this.scaler = ms;
  }

  complete_slip(ms_now: number, notes: number): void {
    if (this.slip_counter < TT_Sequencing2.max_slips) {
      this.mod_parts[this.slip_counter] = this.construct_mod_part();
    }
    ++this.slip_counter;

    // any time we complete a slip we can start another slip, so just
    // start again
    this.fizz.start(ms_now, notes);
  }

  // only start if we pick up ohjump or hand with an ohjump, not a quad, not
  // singles
  static start_test(notes: number): boolean {
    // either left hand jump or a hand containing left hand jump
    // or right hand jump or a hand containing right hand jump
    return notes === 3 || notes === 12;
  }

  operator(ms_now: number, notes: number): void {
    // ignore quads
    if (notes === 15) {
      // reset if we are in a sequence
      if (this.fizz.slippin_till_ya_slips_come_true) {
        this.fizz.reset();
      }
      return;
    }

    // haven't started
    if (!this.fizz.slippin_till_ya_slips_come_true) {
      // col check to start
      if (TT_Sequencing2.start_test(notes)) {
        this.fizz.start(ms_now, notes);
      }
      return;
    }
    // run the col checks for continuation
    if (this.fizz.the_slip_is_the_boot(notes)) {
      this.fizz.grow(ms_now, notes);
      // we found... the thing
      if (this.fizz.slide === 5) {
        this.complete_slip(ms_now, notes);
      }
    } else {
      // reset if we fail col check
      this.fizz.reset();
    }
  }

  reset(): void {
    this.slip_counter = 0;
    this.mod_parts.fill(1.0);
  }

  construct_mod_part(): number {
    return this.scaler;
  }
}
