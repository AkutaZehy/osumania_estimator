// ============================================================
// windowIndex.ts — shared sliding-window counting
// Both density and tech KPS scan every note against a fixed time
// window; this centralizes the two-pointer O(n) version so the
// (previously quadratic) scans run once per metric with no
// duplicated bookkeeping.
// ============================================================

/**
 * Sliding-window note counts: counts[i] = number of times in
 * [sorted[i], sorted[i] + windowMs).
 *
 * Requires sorted ascending input. O(n) total via a monotonic
 * head pointer (windowEnd only moves forward as i advances).
 */
export function windowCounts(sorted: number[], windowMs: number): number[] {
  const counts = new Array<number>(sorted.length);
  let head = 0; // first index with sorted[head] >= windowEnd
  for (let i = 0; i < sorted.length; i++) {
    const windowEnd = sorted[i]! + windowMs;
    while (head < sorted.length && sorted[head]! < windowEnd) head++;
    counts[i] = head - i;
  }
  return counts;
}

/** P90 of the window counts (sustained peak, not absolute max). */
export function p90WindowCount(counts: number[]): number {
  if (counts.length === 0) return 0;
  const sorted = [...counts].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1);
  return sorted[idx]!;
}