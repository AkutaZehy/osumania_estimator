// ============================================================
// Math Utility Functions for Sunny Rework Algorithm
// Ported from Star-Rating-Rebirth algorithm.py
// and osumania_map_analyser sunnyAlgorithm.js
// ============================================================

/**
 * Binary search: find leftmost insertion point for target.
 */
export function bisectLeft(arr: Float64Array | number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Binary search: find rightmost insertion point for target.
 */
export function bisectRight(arr: Float64Array | number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Compute cumulative integral of a piecewise-constant function.
 *
 * Given sorted positions x (length N) and function values f defined
 * piecewise constant on [x[i], x[i+1]), return F where:
 *   F[0] = 0
 *   F[i] = Σ_{j=0}^{i-1} f[j] * (x[j+1] - x[j])   for i ≥ 1
 *
 * Matches the JS reference cumulativeSum exactly.
 */
export function cumulativeSum(
  x: Float64Array,
  f: Float64Array,
): Float64Array {
  const F = new Float64Array(x.length);
  for (let i = 1; i < x.length; i++) {
    F[i] = F[i - 1]! + f[i - 1]! * (x[i]! - x[i - 1]!);
  }
  return F;
}

/**
 * Query the cumulative integral at an arbitrary time point q.
 *
 * Uses binary search to find the segment containing q,
 * then computes F[i] + f[i] * (q - x[i]).
 *
 * Matches the JS reference queryCumsum exactly.
 */
export function queryCumsum(
  q: number,
  x: Float64Array,
  F: Float64Array,
  f: Float64Array,
): number {
  if (q <= x[0]!) return 0;
  if (q >= x[x.length - 1]!) return F[F.length - 1]!;
  const i = bisectRight(x, q) - 1;
  return F[i]! + f[i]! * (q - x[i]!);
}

/**
 * Apply a symmetric sliding window smooth to a piecewise-constant function.
 *
 * Uses the cumulative integral technique: for each corner position s,
 * computes the integral of f over [s - window, s + window], then applies
 * the scale multiplier (for "sum" mode) or divides by window width (for "avg").
 *
 * Matches the JS reference smoothOnCorners exactly.
 *
 * @param x - Sorted corner time positions (ms)
 * @param f - Piecewise-constant function values at each corner
 * @param window - Half-window width in ms (total window = 2 * window)
 * @param scale - Global multiplier applied to result (for "sum" mode only)
 * @param mode - "sum" returns scale * integral; "avg" returns integral / width
 */
export function smoothOnCorners(
  x: Float64Array,
  f: Float64Array,
  window: number,
  scale = 1.0,
  mode: "sum" | "avg" = "sum",
): Float64Array {
  const F = cumulativeSum(x, f);
  const g = new Float64Array(f.length);

  for (let i = 0; i < x.length; i++) {
    const s = x[i]!;
    const a = Math.max(s - window, x[0]!);
    const b = Math.min(s + window, x[x.length - 1]!);
    const val = queryCumsum(b, x, F, f) - queryCumsum(a, x, F, f);

    if (mode === "avg") {
      g[i] = b - a > 0 ? val / (b - a) : 0;
    } else {
      g[i] = scale * val;
    }
  }

  return g;
}

/**
 * Linear interpolation between known data points.
 */
export function interpValues(
  knownXs: Float64Array,
  knownYs: Float64Array,
  queryXs: Float64Array,
): Float64Array {
  const result = new Float64Array(queryXs.length);
  for (let i = 0; i < queryXs.length; i++) {
    const x = queryXs[i]!;
    const idx = bisectLeft(knownXs, x);

    if (idx === 0) {
      result[i] = knownYs[0]!;
    } else if (idx >= knownXs.length) {
      result[i] = knownYs[knownYs.length - 1]!;
    } else {
      const x0 = knownXs[idx - 1]!;
      const x1 = knownXs[idx]!;
      const y0 = knownYs[idx - 1]!;
      const y1 = knownYs[idx]!;
      const t = (x - x0) / (x1 - x0);
      result[i] = y0 + t * (y1 - y0);
    }
  }
  return result;
}

/**
 * Zero-order hold (step) interpolation.
 */
export function stepInterp(
  knownXs: Float64Array,
  knownYs: Float64Array,
  queryXs: Float64Array,
): Float64Array {
  const result = new Float64Array(queryXs.length);
  for (let i = 0; i < queryXs.length; i++) {
    const x = queryXs[i]!;
    const idx = bisectRight(knownXs, x) - 1;
    result[i] = idx >= 0 ? knownYs[idx]! : knownYs[0]!;
  }
  return result;
}

/**
 * Rescale high star ratings: above 9 compressed by 1.2x.
 */
export function rescaleHigh(sr: number): number {
  if (sr <= 9) return sr;
  return 9 + (sr - 9) * (1 / 1.2);
}

/**
 * Find the next note in a given column after the specified time.
 */
export function findNextNoteInColumn(
  noteSeq: Array<[number, number, number]>,
  col: number,
  afterTime: number,
): [number, number] | null {
  for (const [c, t, e] of noteSeq) {
    if (c === col && t >= afterTime) {
      return [t, e];
    }
  }
  return null;
}

/**
 * Merge two sorted note arrays by head time.
 */
export function mergeByHead(
  a: Array<[number, number, number]>,
  b: Array<[number, number, number]>,
): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i]![1] < b[j]![1]) {
      result.push(a[i]!);
      i++;
    } else {
      result.push(b[j]!);
      j++;
    }
  }
  while (i < a.length) result.push(a[i++]!);
  while (j < b.length) result.push(b[j++]!);
  return result;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
