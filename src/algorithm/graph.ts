// ============================================================
// graph.ts — generateGraph (proximity envelope + Gaussian smooth)
// Ported from osumania_map_analyser sunnyAlgorithm.js lines 794-872
// ============================================================

import { bisectLeft, interpValues } from "./mathUtils.js";
import type { DifficultyGraph } from "../types/algorithm.js";

type NoteTuple = [number, number, number]; // [column, head, tail]

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
 * Apply proximity envelope: fade difficulty to zero far from any note.
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
 * Smooth the difficulty curve for graph display.
 *
 * 1. Resample to uniform 100ms intervals
 * 2. Zero out regions >400ms from any note
 * 3. Apply Gaussian smoothing (σ = 800ms)
 * 4. Zero out again post-smooth
 * 5. Interpolate back to original corner positions
 *
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
    allCorners,
    DAll,
    new Float64Array(uniformTimes),
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
    interpValues(new Float64Array(uniformTimes), new Float64Array(smoothed), allCorners),
  );
}

/**
 * Generate the difficulty graph from D_all values.
 *
 * @param allCorners - All corner time positions
 * @param DAll - Difficulty values at each all-corner
 * @param noteSeq - Flat note sequence
 * @returns DifficultyGraph with times and smoothed values
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
