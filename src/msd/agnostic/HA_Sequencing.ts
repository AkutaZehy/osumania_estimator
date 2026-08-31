// Port of Etterna 0.72.3 HA_Sequencing.h

// hand agnostic pattern sequencing is a little less developed than its
// counterpart and just contains some basic bitwise helpers for the moment

/// bitwise operations on noteinfo.notes, they must be unsigned ints, and
/// shouldn't be called on enums or row counts or anything like that

/// detect if this row of NoteInfo notes is a single tap
export function is_single_tap(a: number): boolean {
  return (a & (a - 1)) === 0;
}

/// between two successive rows usually... but i suppose this could be called
/// outside of that limitation
export function is_jack_at_col(
  columnId: number,
  row_notes: number,
  last_row_notes: number,
): boolean {
  return (
    (columnId & row_notes) !== 0 && (columnId & last_row_notes) !== 0
  );
}

/// detect a tap and then a chord, or a chord and then a tap.
/// valid input is any given NoteInfo notes
/// doesn't check for jacks
export function is_alternating_chord_single(a: number, b: number): boolean {
  return (a > 1 && b === 1) || (a === 1 && b > 1);
}

/// find 1[n]1 or [n]1[n] with no jacks between first and
/// second and second and third elements
export function is_alternating_chord_stream(
  a: number,
  b: number,
  c: number,
): boolean {
  if (is_single_tap(a)) {
    if (is_single_tap(b)) {
      // single single, don't care, bail
      return false;
    }
    if (!is_single_tap(c)) {
      // single, chord, chord, bail
      return false;
    }
  } else {
    if (!is_single_tap(b)) {
      // chord chord, don't care, bail
      return false;
    }
    if (is_single_tap(c)) {
      // chord, single, single, bail
      return false;
    }
  }
  // we have either 1[n]1 or [n]1[n], check for any jacks
  // (upstream: static_cast<int>(...) == 0)
  return ((((a & b) !== 0) && ((b & c) !== 0)) ? 1 : 0) === 0;
}
