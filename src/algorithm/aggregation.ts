// ============================================================
// aggregation.ts — D_all computation, percentile aggregation, SR formula
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 874-1004
// ============================================================

import { bisectLeft, interpValues, stepInterp, rescaleHigh } from "./mathUtils.js";
import { computeJbar } from "./jbar.js";
import { computeXbar } from "./xbar.js";
import { computePbar } from "./pbar.js";
import { computeAbar } from "./abar.js";
import { computeRbar } from "./rbar.js";
import { computeCAndKs } from "./density.js";
import {
  getCorners,
  getKeyUsage,
  getKeyUsage_400,
  computeAnchor,
  LN_bodies_count_sparse_representation,
} from "./corners.js";
import type { LNBodiesSparseRep } from "./corners.js";
import type { SunnyResult, SunnyBars, DifficultyGraph } from "../types/algorithm.js";

type NoteTuple = [number, number, number]; // [column, head, tail]

// ============================================================
// Graph generation (proximity envelope + Gaussian smooth)
// ============================================================

const BREAK_ZERO_THRESHOLD_MS = 400;
const GRAPH_RESAMPLE_INTERVAL_MS = 100;
const SMOOTH_SIGMA_MS = 800;

/**
 * Apply a Gaussian filter to a 1D data array.
 * Matches the JS reference gaussianFilter1d (lines 125-158).
 */
function gaussianFilter1d(
  data: Float64Array | number[],
  sigmaSamples: number,
): number[] {
  if (!Number.isFinite(sigmaSamples) || sigmaSamples <= 0) {
    return Array.from(data);
  }

  const radius = Math.max(1, Math.trunc(4 * sigmaSamples + 0.5));
  const kernelSize = radius * 2 + 1;
  const kernel = new Float64Array(kernelSize);
  let kernelSum = 0;

  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-0.5 * (i / sigmaSamples) ** 2);
    kernel[i + radius] = v;
    kernelSum += v;
  }
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] = kernel[i]! / kernelSum;
  }

  const padded = new Float64Array(data.length + radius * 2);
  for (let i = 0; i < data.length; i++) {
    padded[i + radius] = data[i]!;
  }

  const out = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) {
    let acc = 0;
    for (let k = 0; k < kernelSize; k++) {
      acc += padded[i + k]! * kernel[k]!;
    }
    out[i] = acc;
  }
  return Array.from(out);
}

/**
 * Apply proximity envelope: fade difficulty to zero far from notes.
 * Matches the JS reference applyProximityEnvelope (lines 794-821).
 */
function applyProximityEnvelope(
  allCorners: Float64Array,
  DAll: Float64Array,
  noteSeq: NoteTuple[],
): number[] {
  if (!noteSeq.length) {
    return Array.from(DAll);
  }

  const noteTimes = noteSeq
    .map((n) => Number(n[1]))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (!noteTimes.length) {
    return Array.from(DAll);
  }

  const proximityFadeMs = 500;
  const out = new Float64Array(allCorners.length);
  for (let i = 0; i < allCorners.length; i++) {
    const t = allCorners[i]!;
    const idx = bisectLeft(noteTimes, t);
    const after =
      idx < noteTimes.length
        ? Math.abs(noteTimes[idx]! - t)
        : Number.POSITIVE_INFINITY;
    const before =
      idx > 0 ? Math.abs(noteTimes[idx - 1]! - t) : Number.POSITIVE_INFINITY;
    const d = Math.min(after, before);
    const ratio = Math.max(0, Math.min(d / proximityFadeMs, 1));
    const envelope = 0.5 * (1 + Math.cos(Math.PI * ratio));
    out[i] = DAll[i]! * envelope;
  }
  return Array.from(out);
}

/**
 * Generate smooth difficulty curve for graph display.
 * Matches the JS reference smoothDForGraph (lines 823-872).
 */
function smoothDForGraph(
  allCorners: Float64Array,
  DAll: Float64Array,
  noteSeq: NoteTuple[],
): number[] {
  if (!allCorners.length || !DAll.length) {
    return [];
  }

  const tStart = allCorners[0]!;
  const tEnd = allCorners[allCorners.length - 1]!;
  const uniformTimes: number[] = [];
  for (
    let t = tStart;
    t <= tEnd + GRAPH_RESAMPLE_INTERVAL_MS;
    t += GRAPH_RESAMPLE_INTERVAL_MS
  ) {
    uniformTimes.push(t);
  }

  const noteTimes = noteSeq
    .map((n) => Number(n[1]))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  const uniformD = interpValues(
    new Float64Array(uniformTimes),
    allCorners,
    DAll,
  );

  // Zero out regions far from notes
  if (noteTimes.length) {
    for (let i = 0; i < uniformTimes.length; i++) {
      const t = uniformTimes[i]!;
      const idx = bisectLeft(noteTimes, t);
      const after =
        idx < noteTimes.length
          ? Math.abs(noteTimes[idx]! - t)
          : Number.POSITIVE_INFINITY;
      const before =
        idx > 0 ? Math.abs(noteTimes[idx - 1]! - t) : Number.POSITIVE_INFINITY;
      const dist = Math.min(after, before);
      if (dist > BREAK_ZERO_THRESHOLD_MS) {
        uniformD[i] = 0;
      }
    }
  }

  const sigmaSamples = SMOOTH_SIGMA_MS / GRAPH_RESAMPLE_INTERVAL_MS;
  const smoothed = gaussianFilter1d(uniformD, sigmaSamples);

  // Zero out regions far from notes again after smoothing
  if (noteTimes.length) {
    for (let i = 0; i < uniformTimes.length; i++) {
      const t = uniformTimes[i]!;
      const idx = bisectLeft(noteTimes, t);
      const after =
        idx < noteTimes.length
          ? Math.abs(noteTimes[idx]! - t)
          : Number.POSITIVE_INFINITY;
      const before =
        idx > 0 ? Math.abs(noteTimes[idx - 1]! - t) : Number.POSITIVE_INFINITY;
      const dist = Math.min(after, before);
      if (dist > BREAK_ZERO_THRESHOLD_MS) {
        smoothed[i] = 0;
      }
    }
  }

  return Array.from(
    interpValues(allCorners, new Float64Array(uniformTimes), new Float64Array(smoothed)),
  );
}

/**
 * Generate the difficulty graph from D_all values.
 */
export function generateGraph(
  allCorners: Float64Array,
  DAll: Float64Array,
  noteSeq: NoteTuple[],
): DifficultyGraph {
  const DPre = applyProximityEnvelope(allCorners, DAll, noteSeq);
  const DGraph = smoothDForGraph(allCorners, Float64Array.from(DPre), noteSeq);
  return {
    times: Array.from(allCorners),
    values: DGraph,
  };
}

// ============================================================
// Main aggregation: compute D_all, percentiles, SR
// ============================================================

/**
 * Full Sunny Rework calculation.
 *
 * @param x - Hit leniency (derived from OD)
 * @param K - Column/key count
 * @param noteSeq - Flat note sequence [col, head, tail]
 * @param noteSeqByColumn - Notes grouped by column
 * @param lnSeq - LN-only notes
 * @param tailSeq - LN notes sorted by tail time
 * @param lnRatio - LN ratio (0–1)
 * @param columnCount - Number of columns
 * @param withGraph - Whether to generate difficulty graph
 * @returns SunnyResult with star rating and optional graph/bars
 */
export function calculate(
  x: number,
  K: number,
  noteSeq: NoteTuple[],
  noteSeqByColumn: NoteTuple[][],
  lnSeq: NoteTuple[],
  tailSeq: NoteTuple[],
  lnRatio: number,
  columnCount: number,
  withGraph: boolean,
): SunnyResult {
  const T = Math.max(
    ...noteSeq.map((n) => Math.max(n[1], n[2])),
    0,
  ) + 1;

  // Corner generation
  const { all: allCorners, base: baseCorners, A: ACorners } = getCorners(noteSeq, lnSeq, T);

  // Key usage
  const keyUsage = getKeyUsage(noteSeqByColumn, baseCorners, K, T);

  // Active columns at each base corner
  const activeColumns: number[][] = [];
  for (let i = 0; i < baseCorners.length; i++) {
    const active: number[] = [];
    for (let k = 0; k < K; k++) {
      if (keyUsage[k]![i]) active.push(k);
    }
    activeColumns.push(active);
  }

  // Weighted key usage + anchor
  const keyUsage400 = getKeyUsage_400(noteSeqByColumn, baseCorners, T);
  const anchor = computeAnchor(keyUsage400, K);

  // Compute individual bars
  const { deltaKs, Jbar: JbarBase } = computeJbar(K, x, noteSeqByColumn, baseCorners);
  const Jbar = interpValues(baseCorners, JbarBase, allCorners);

  const XbarBase = computeXbar(K, x, noteSeqByColumn, activeColumns, baseCorners);
  const Xbar = interpValues(baseCorners, XbarBase, allCorners);

  const lnRep: LNBodiesSparseRep = LN_bodies_count_sparse_representation(
    // LN_bodies_count_sparse_representation expects lnSeqByColumn, but it flattens internally
    noteSeqByColumn.map((colNotes) =>
      colNotes.filter((n) => n[2] >= 0),
    ),
    baseCorners,
  );

  const PbarBase = computePbar(x, noteSeq, lnRep, anchor, baseCorners);
  const Pbar = interpValues(baseCorners, PbarBase, allCorners);

  const AbarBase = computeAbar(K, activeColumns, deltaKs, ACorners, baseCorners);
  const Abar = interpValues(ACorners, AbarBase, allCorners);

  const RbarBase = computeRbar(K, x, noteSeqByColumn, tailSeq, baseCorners);
  const Rbar = interpValues(baseCorners, RbarBase, allCorners);

  // Density and active columns
  const { CStep, KsStep } = computeCAndKs(K, noteSeq, keyUsage, baseCorners);
  const CArr = stepInterp(baseCorners, CStep, allCorners);
  const KsArr = stepInterp(baseCorners, KsStep, allCorners);

  // ---- D_all at each all-corner ----
  const DAll = new Float64Array(allCorners.length);
  for (let i = 0; i < allCorners.length; i++) {
    // Guard: ensure Ks is at least 1 and bar values are non-negative
    const ks = Math.max(1, KsArr[i]!);
    const jVal = Math.max(0, Jbar[i]!);
    const xVal = Math.max(0, Xbar[i]!);
    const pVal = Math.max(0, Pbar[i]!);
    const rVal = Math.max(0, Rbar[i]!);
    const aVal = Math.max(0, Math.min(1, Abar[i]!));
    const cVal = Math.max(0, CArr[i]!);

    const abarPow = aVal ** (3 / ks);
    const leftPart =
      0.4 * (abarPow * Math.min(jVal, 8 + 0.85 * jVal)) ** 1.5;
    const rightPart =
      0.6 *
      (aVal ** (2 / 3) *
        (0.8 * pVal + (rVal * 35) / (cVal + 8))) **
        1.5;
    const SAll = Math.max(0, (leftPart + rightPart) ** (2 / 3));
    const TAll =
      (abarPow * xVal) / (xVal + SAll + 1);
    DAll[i] = 2.7 * SAll ** 0.5 * TAll ** 1.5 + SAll * 0.27;

    // Fallback if NaN produced
    if (!Number.isFinite(DAll[i]!)) DAll[i] = 0;
  }

  // ---- Time gaps for weighting ----
  const gaps = new Float64Array(allCorners.length);
  gaps[0] = (allCorners[1]! - allCorners[0]!) / 2;
  gaps[gaps.length - 1] =
    (allCorners[allCorners.length - 1]! - allCorners[allCorners.length - 2]!) / 2;
  for (let i = 1; i < allCorners.length - 1; i++) {
    gaps[i] = (allCorners[i + 1]! - allCorners[i - 1]!) / 2;
  }

  // ---- Weighted percentile ----
  const effectiveWeights: number[] = [];
  for (let i = 0; i < allCorners.length; i++) {
    effectiveWeights.push(CArr[i]! * gaps[i]!);
  }

  // Sort by D value
  const sortedIndices = Array.from(DAll.keys()).sort(
    (a, b) => DAll[a]! - DAll[b]!,
  );
  const DSorted = sortedIndices.map((i) => DAll[i]!);
  const wSorted = sortedIndices.map((i) => effectiveWeights[i]!);

  // Cumulative weights
  const cumWeights: number[] = [];
  let running = 0;
  for (let i = 0; i < wSorted.length; i++) {
    running += wSorted[i]!;
    cumWeights.push(running);
  }

  const totalWeight = cumWeights[cumWeights.length - 1]!;
  const normCumWeights = cumWeights.map((w) => w / totalWeight);

  const targetPercentiles = [
    0.945, 0.935, 0.925, 0.915, 0.845, 0.835, 0.825, 0.815,
  ];
  const percentileIndices = targetPercentiles.map((p) =>
    bisectLeft(normCumWeights, p),
  );

  const firstGroup = percentileIndices
    .slice(0, 4)
    .map((idx) => DSorted[Math.min(idx, DSorted.length - 1)]!);
  const secondGroup = percentileIndices
    .slice(4, 8)
    .map((idx) => DSorted[Math.min(idx, DSorted.length - 1)]!);

  const percentile93 =
    firstGroup.length > 0
      ? firstGroup.reduce((acc, v) => acc + v, 0) / firstGroup.length
      : 0;
  const percentile83 =
    secondGroup.length > 0
      ? secondGroup.reduce((acc, v) => acc + v, 0) / secondGroup.length
      : 0;

  // Weighted mean (5th-power)
  let num = 0;
  let den = 0;
  for (let i = 0; i < DSorted.length; i++) {
    num += DSorted[i]! ** 5 * wSorted[i]!;
    den += wSorted[i]!;
  }
  const weightedMean = den > 0 ? (num / den) ** (1 / 5) : 0;

  // ---- Star Rating ----
  let sr =
    0.88 * percentile93 * 0.25 +
    0.94 * percentile83 * 0.2 +
    weightedMean * 0.55;

  // Note count normalization (LN length bonus)
  let lnLengthTerm = 0;
  for (const [, h, t] of lnSeq) {
    lnLengthTerm += Math.min(t - h, 1000) / 200;
  }
  const totalNotes = noteSeq.length + 0.5 * lnLengthTerm;
  sr *= totalNotes / (totalNotes + 60);

  sr = rescaleHigh(sr);
  sr *= 0.975;

  // Final NaN guard
  if (!Number.isFinite(sr)) sr = -1;

  // ---- Build result ----
  // Build per-point bars array
  const bars: SunnyBars[] = [];
  for (let i = 0; i < allCorners.length; i++) {
    bars.push({
      jbar: Jbar[i]!,
      xbar: Xbar[i]!,
      pbar: Pbar[i]!,
      abar: Abar[i]!,
      rbar: Rbar[i]!,
      c: CArr[i]!,
      ks: KsArr[i]!,
      d: DAll[i]!,
    });
  }

  // Hit leniency computed from OD
  const hitLeniency = x;

  const result: SunnyResult = {
    star: sr,
    numericDifficulty: sr,
    lnRatio,
    columnCount,
    graph: { times: [], values: [] },
    bars,
    hitLeniency,
  };

  if (withGraph) {
    result.graph = generateGraph(allCorners, DAll, noteSeq);
  }

  return result;
}
