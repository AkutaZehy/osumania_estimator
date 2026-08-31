// Port of Etterna 0.72.3 Dependent/HD_BasicSequencing.h

import { col_type } from "../enums.js";

// note: this are clearly restricted to 4k

// refrence notemap
// "----", "1---", "-1--", "11--",
// "--1-", "1-1-", "-11-", "111-",
// "---1", "1--1", "-1-1", "11-1",
// "--11", "1-11", "-111", "1111" };

// col_type itself lives in ../enums.ts (exact numeric layout of the C++ enum)

export const num_cols_per_hand = 2;

export const ct_loop: readonly [
  col_type,
  col_type,
  col_type,
] = [col_type.col_left, col_type.col_right, col_type.col_ohjump];

export const ct_loop_no_jumps: readonly [col_type, col_type] = [
  col_type.col_left,
  col_type.col_right,
];

/** Given notes for a certain hand, tell what kind of tap it is for this hand */
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
  // assert(0)
  return col_type.col_init;
}

/** inverting ct type for col_left or col_right only, col name here is very much
 * intentional */
export function invert_col(col: col_type): col_type {
  return col === col_type.col_left ? col_type.col_right : col_type.col_left;
}

// base_type is defined here exactly as in the C++ header (HD_BasicSequencing.h)
export const base_type = {
  base_left_right: 0,
  base_right_left: 1,
  base_jump_single: 2,
  base_single_single: 3,
  base_single_jump: 4,
  base_jump_jump: 5,
  num_base_types: 6,
  base_type_init: 7,
} as const;
export type base_type = (typeof base_type)[keyof typeof base_type];

/** Unscoped aliases matching the C++ enum member names for importers. */
export const base_left_right: base_type = base_type.base_left_right;
export const base_right_left: base_type = base_type.base_right_left;
export const num_base_types: number = base_type.num_base_types;

/** Given two consecutive column types, what is the pattern forming? */
export function determine_base_pattern_type(
  now: col_type,
  last: col_type,
): base_type {
  if (last === col_type.col_init) {
    return base_type.base_type_init;
  }

  const single_tap = now === col_type.col_left || now === col_type.col_right;
  if (last === col_type.col_ohjump) {
    if (single_tap) {
      return base_type.base_jump_single;
    }
    {
      // can't be anything else
      return base_type.base_jump_jump;
    }
  } else if (!single_tap) {
    return base_type.base_single_jump;
    // if we are on left col _now_, we are right to left
  } else if (now === col_type.col_left && last === col_type.col_right) {
    return base_type.base_right_left;
  } else if (now === col_type.col_right && last === col_type.col_left) {
    return base_type.base_left_right;
  } else if (now === last) {
    // anchor/jack
    return base_type.base_single_single;
  }

  // makes no logical sense
  // assert(0)
  return base_type.base_type_init;
}

// note, base_left_right and base_right_left will be referred to as cross column
// hits, as in, successive single notes that cross columns and are exclusive of
// ohjumps
export function is_cc_tap(bt: base_type): boolean {
  return bt === base_type.base_left_right || bt === base_type.base_right_left;
}
