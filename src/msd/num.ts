// ============================================================
// MSD engine — numeric helpers
// Ports of PatternModHelpers.h / SequencingHelpers.h / MinaCalcHelpers.h.
// The originals compute in C++ float (32-bit); JS uses doubles. Where the
// original applies an explicit approximate function (fastpow, fastsqrt) we
// keep the same approximation so downstream comparisons stay meaningful.
// ============================================================

import { any_ms_epsilon, finalscaler, low_acc_cutoff, max_rating, min_rating } from "./enums.js";

const powBuf = new ArrayBuffer(8);
const powF64 = new Float64Array(powBuf);
const powI32 = new Int32Array(powBuf);

/**
 * Port of the SSE2 exponent-scaling `fastpow` (PatternModHelpers.h).
 * Significantly inaccurate on purpose — the reference values are produced
 * with this, so we reproduce the bit trick instead of using Math.pow.
 */
export function fastpow(a: number, b: number): number {
  powF64[0] = a;
  powI32[1] = (b * (powI32[1]! - 1072632447) + 1072632447) | 0;
  powI32[0] = 0;
  return Math.fround(powF64[0]);
}

/**
 * Port of `fastsqrt` — the original is `x * rsqrt_ss(x)`, ~12-bit accurate.
 * Math.sqrt is exact and within the approximation band of the intrinsic.
 */
export function fastsqrt(x: number): number {
  if (x === 0.0) return 0.0;
  return Math.fround(Math.sqrt(x));
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function sum(v: readonly number[]): number {
  let o = 0;
  for (const x of v) o += x;
  return o;
}

export function mean(v: readonly number[]): number {
  return sum(v) / v.length;
}

/** Coefficient of variation (PatternModHelpers.h cv). */
export function cv(input: readonly number[]): number {
  let sd = 0.0;
  const average = mean(input);
  for (const i of input) sd += (i - average) * (i - average);
  return fastsqrt(sd / input.length) / average;
}

/** cv of the first num_vals values, dummy-filled when short. */
export function cv_trunc_fill(
  input: readonly number[],
  num_vals: number,
  ms_dummy: number,
): number {
  const input_sz = input.length;
  let sd = 0.0;
  let average = 0.0;
  if (input_sz >= num_vals) {
    for (let i = 0; i < Math.min(input_sz, num_vals); ++i) average += input[i]!;
    average /= num_vals;
    for (let i = 0; i < Math.min(input_sz, num_vals); ++i) {
      sd += (input[i]! - average) * (input[i]! - average);
    }
    return fastsqrt(sd / num_vals) / average;
  }

  for (let i = 0; i < Math.min(input_sz, num_vals); ++i) average += input[i]!;
  for (let i = 0; i < num_vals - input_sz; ++i) average += ms_dummy;
  average /= num_vals;
  for (let i = 0; i < Math.min(input_sz, num_vals); ++i) {
    sd += (input[i]! - average) * (input[i]! - average);
  }
  for (let i = 0; i < num_vals - input_sz; ++i) {
    sd += (ms_dummy - average) * (ms_dummy - average);
  }
  return fastsqrt(sd / num_vals) / average;
}

export function sum_trunc_fill(
  input: readonly number[],
  num_vals: number,
  ms_dummy: number,
): number {
  const input_sz = input.length;
  let acc = 0.0;
  for (let i = 0; i < Math.min(input_sz, num_vals); ++i) acc += input[i]!;
  if (input_sz >= num_vals) return acc;
  for (let i = 0; i < num_vals - input_sz; ++i) acc += ms_dummy;
  return acc;
}

export function div_high_by_low(a: number, b: number): number {
  if (b > a) [a, b] = [b, a];
  return a / b;
}

export function div_low_by_high(a: number, b: number): number {
  if (b > a) [a, b] = [b, a];
  return b / a;
}

export function diff_high_by_low(a: number, b: number): number {
  if (b > a) [a, b] = [b, a];
  return a - b;
}

export function weighted_average(a: number, b: number, x: number, y: number): number {
  return (x * a + (y - x) * b) / y;
}

export function lerp(t: number, a: number, b: number): number {
  return (1.0 - t) * a + t * b;
}

// ---- SequencingHelpers.h ----

export function column_count(notes: number): number {
  // singles
  if (notes === 1 || notes === 2 || notes === 4 || notes === 8) return 1;
  // hands
  if (notes === 7 || notes === 11 || notes === 13 || notes === 14) return 3;
  // quad
  if (notes === 15) return 4;
  // everything else is a jump
  return 2;
}

export function ms_from(now: number, last: number): number {
  return (now - last) * 1000.0;
}

export function ms_to_bpm(x: number): number {
  return 15000.0 / x;
}

export function ms_to_nps(x: number): number {
  return 1000.0 / x;
}

export function ms_to_scaled_nps(ms: number): number {
  return ms_to_nps(ms) * finalscaler;
}

export function max_val(v: readonly number[]): number {
  let o = v[0]!;
  for (const x of v) if (x > o) o = x;
  return o;
}

export function max_index(v: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < v.length; ++i) if (v[i]! > v[best]!) best = i;
  return best;
}

/** Row delta comparisons (SequencingHelpers.h) — 0.1f tolerance at ms scale. */
export function any_ms_is_greater(a: number, b: number): boolean {
  return a - b > any_ms_epsilon;
}

export function any_ms_is_lesser(a: number, b: number): boolean {
  return b - a > any_ms_epsilon;
}

export function any_ms_is_close(a: number, b: number): boolean {
  return Math.abs(a - b) <= any_ms_epsilon;
}

export function any_ms_is_zero(a: number): boolean {
  return any_ms_is_close(a, 0.0);
}

// ---- MinaCalcHelpers.h ----

export function downscale_low_accuracy_scores(f: number, sg: number): number {
  return sg >= low_acc_cutoff
    ? f
    : Math.min(
        Math.max(f / Math.pow(1.0 + (low_acc_cutoff - sg), 3.25), min_rating),
        max_rating,
      );
}

/** Abramowitz & Stegun 7.1.26 complementary error function (~1.5e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 2.0 / (2.0 + z);
  const ty = 4 * t - 2;
  const cof = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
    1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
    5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11,
    2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13,
    3.81e-16, 7.106e-15,
  ];
  let d = 0.0;
  let dd = 0.0;
  for (let j = cof.length - 1; j > 0; --j) {
    const tmp = d;
    d = ty * d - dd + cof[j]!;
    dd = tmp;
  }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0]! + ty * d) - dd);
  return x >= 0.0 ? ans : 2.0 - ans;
}

/** Sigmoidal aggregation for Overall (MinaCalcHelpers.h aggregate_skill). */
export function aggregate_skill(
  v: readonly number[],
  delta_multiplier: number,
  result_multiplier: number,
  rating = 0.0,
  resolution = 10.24,
): number {
  for (let i = 0; i < 11; i++) {
    let sumAcc: number;
    do {
      rating += resolution;
      sumAcc = 0.0;
      for (const vv of v) {
        sumAcc += Math.max(0.0, 2.0 / erfc(delta_multiplier * (vv - rating)) - 2);
      }
    } while (Math.pow(2, rating * 0.1) < sumAcc);
    rating -= resolution;
    resolution /= 2.0;
  }
  rating += resolution * 2.0;
  return rating * result_multiplier;
}
