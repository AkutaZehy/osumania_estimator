// Port of Etterna 0.72.3 Dependent/HD_MetaSequencing.h

import { base_type, is_cc_tap } from "./HD_BasicSequencing.js";

/** meta patterns are formed by chains of base patterns, we could pick up
 * triplets (left_right, right_left), or triple jacks (single_single,
 * single_single), but these aren't particularly useful for our use case, meta
 * patterns types are largely used in conjunction with timing checks to pick up
 * mashable sequences of notes and depress them so they do not inflate certain
 * files, however there is potential to try to pick up broader sequences of
 * tricky patterns and upscale them, it's just not done at the moment */
export const meta_type = {
  meta_cccccc: 0,
  meta_ccacc: 1,
  meta_acca: 2,
  meta_ccsjjscc: 3,
  meta_ccsjjscc_inverted: 4,
  meta_enigma: 5,
  meta_meta_enigma: 6,
  meta_unknowable_enigma: 7,
  num_meta_types: 8,
  meta_type_init: 9,
} as const;
export type meta_type = (typeof meta_type)[keyof typeof meta_type];

/** Unscoped alias matching the C++ enum member name for importers. */
export const num_meta_types: number = meta_type.num_meta_types;

// 1212, 2121, etc
// cccccc is cross column, cross column, cross column more colloquially known as
// either an oht, or a roll, depending on the timing, since the definition is
// timing dependent we will simply use the pattern configuration to refer to it,
// until timing checks are run only called if both now and last_last are
// base_left_right || base_right_lef,  then, if it's not cccccc, it's ccacc by
// definition
export function detecc_cccccc(now: base_type, last_last: base_type): boolean {
  // wow it was actually cabbage brain LUL
  return now === last_last;
}

// given 3 consecutive pattern bases (4 notes) - is it jack-cc-jack?
export function detecc_acca(
  a: base_type,
  b: base_type,
  c: base_type,
): boolean {
  // 1122, 2211, etc
  return (
    a === base_type.base_single_single && is_cc_tap(b) && c === base_type.base_single_single
  );
}

// WHOMST'D'VE
// 12[12]12, we'll check now for cc before entering this, so we can then
// determine whether this is an inverted ccsjjscc or not (12[12]21)
export function detecc_sjjscc(
  last: base_type,
  last_last: base_type,
  last_last_last: base_type,
): boolean {
  // check last_last_last first, if it's not cc, throw it out
  if (!is_cc_tap(last_last_last)) {
    {
      {
        return false;
      }
    }
  }

  // last is exiting the jump, last_last is entering it
  // note: we don't care about the single/jump jump/single column order
  // because it can always be inferred from existing data
  return (
    last === base_type.base_jump_single && last_last === base_type.base_single_jump
  );
}

// given the context of the previous 5 rows and the meta type formed,
// what might be the overall meta pattern forming?
export function determine_meta_type(
  now: base_type,
  last: base_type,
  last_last: base_type,
  last_last_last: base_type,
  last_mt: meta_type,
): meta_type {
  // this is either cccccc or ccacc
  if (is_cc_tap(now) && is_cc_tap(last_last)) {
    if (detecc_cccccc(now, last_last)) {
      // 1212, 2121, etc
      return meta_type.meta_cccccc;
    }
    {
      // 1221, 2112, etc
      return meta_type.meta_ccacc;
    }
  }

  /* 1122, 2211, these are generally tricky and we wouldn't be interseted in
   * using them for downscaling in most contexts, however there are
   * jumptrillable patterns that exist for which acca is an axiomatic
   * transition, namely, chains of ccacc, or, ccaccaccaccaccacc, or,
   * 1221221221221221221, scanning down rows will produce alternating meta
   * types of ccacc and acca, so we can use this to do very robust detection,
   * particularly since any other transition type in sequences of these
   * patterns will actually make them significantly harder to manipulate */
  if (detecc_acca(now, last, last_last)) {
    return meta_type.meta_acca;
  }

  // we need to be on a cc to have ccsjjscc
  if (is_cc_tap(now)) {
    // this is a 5 row pattern, so we have to go deep
    if (detecc_sjjscc(last, last_last, last_last_last)) {
      if (now === last_last_last) {
        // 12 [12] 12
        return meta_type.meta_ccsjjscc;
      }
      {
        // 12 [12] 21
        return meta_type.meta_ccsjjscc_inverted;
      }
    }
  }

  // past the point of our current largest meta pattern definitions, so if we
  // see this, we can stop waiting for something like ccsjjscc
  if (last_mt === meta_type.meta_enigma) {
    return meta_type.meta_meta_enigma;
  }

  // there are probably entire packs where we won't even see one of these
  if (last_mt === meta_type.meta_meta_enigma) {
    return meta_type.meta_unknowable_enigma;
  }

  // meta_enigma is commonplace for transitions between two meta types, so we
  // often use it to wait and see what comes next
  return meta_type.meta_enigma;
}
