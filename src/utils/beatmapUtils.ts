// ============================================================
// Beatmap Utilities — shared helpers for note range queries
// ============================================================
// Provides O(log n) note lookup via binary search on the
// pre-built, time-sorted notes array, replacing the previous
// O(n) full-scan pattern used across multiple analyser modules.
// ============================================================

import type { ParsedBeatmap, BeatmapNote } from "../types/beatmap.js";

/**
 * Lower-bound binary search: find the first index where arr[i] >= val.
 * Array MUST be sorted in ascending order.
 */
export function lowerBound(arr: number[], val: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < val) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Upper-bound binary search: find the first index where arr[i] > val.
 * Array MUST be sorted in ascending order.
 */
export function upperBound(arr: number[], val: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! <= val) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Retrieve notes within [startTime, endTime) using binary search.
 *
 * Uses the pre-built `beatmap.notes` array (sorted by start time) and
 * the pre-built `beatmap.noteStarts` index for binary search bounds.
 *
 * @returns Sub-array of notes whose start time is in [startTime, endTime).
 *          Returns a NEW array (slice) so callers may safely mutate.
 */
export function getNotesInRange(
  beatmap: ParsedBeatmap,
  startTime: number,
  endTime: number,
): BeatmapNote[] {
  const starts = beatmap.noteStarts;
  const lo = lowerBound(starts, startTime);
  const hi = lowerBound(starts, endTime); // endTime is exclusive
  return beatmap.notes.slice(lo, hi);
}
