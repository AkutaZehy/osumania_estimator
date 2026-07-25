// ============================================================
// Anchor / Stamina Analysis — SF, SH, DH
//
// SF  (Single Finger) — per-column anchor stamina
// SH  (Single Hand)   — left/right hand stamina
// DH  (Dual Hand)     — alternating/paired finger stamina
//
// Bridge rule (fault tolerance):
//   gap=1 → always continues
//   gap=2 → bridges only if followed by `countdown` consecutive notes
//   gap≥3 → never bridges
//
// P100 uses bridge tolerance; P90/P50 use strict (no tolerance).
// All P100 use bridge countdown=4.
// Values are in **measures** (4 beats of 16th notes).
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { GridAnalysisResult } from "./gridAnalysis.js";
import type { AnchorMetrics, AnchorTier } from "../types/custom.js";

// ---------------------------------------------------------------------------
// Pure functions — segment detection
// ---------------------------------------------------------------------------

export function findSegmentsBridge(
  positions: number[],
  minCount: number,
  countdown: number,
): number[][] {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  if (sorted.length < minCount) return [];
  const all: number[][] = [];
  let i = 0;
  while (i < sorted.length) {
    if (i + minCount > sorted.length) break;
    let ok = true;
    for (let k = 1; k < minCount; k++) {
      if (sorted[i + k]! !== sorted[i]! + k) { ok = false; break; }
    }
    if (!ok) { i++; continue; }
    const seg: number[] = [sorted[i]!, sorted[i + 1]!, sorted[i + 2]!];
    let pos = sorted[i + minCount - 1]!;
    let j = i + minCount;
    while (j < sorted.length) {
      const gap = sorted[j]! - pos;
      if (gap === 1) { seg.push(sorted[j]!); pos = sorted[j]!; j++; }
      else if (gap === 2) {
        if (j + countdown <= sorted.length) {
          let ok2 = true;
          for (let k = 0; k < countdown; k++) {
            if (sorted[j + k]! !== sorted[j]! + k) { ok2 = false; break; }
          }
          if (ok2) {
            for (let k = 0; k < countdown; k++) seg.push(sorted[j + k]!);
            pos = sorted[j + countdown - 1]!;
            j += countdown;
          } else break;
        } else break;
      } else break;
    }
    if (seg.length >= minCount) all.push(seg);
    i = j;
  }
  return all;
}

export function findSegmentsStrict(
  positions: number[],
  minCount: number,
): number[][] {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  if (sorted.length < minCount) return [];
  const all: number[][] = [];
  let i = 0;
  while (i < sorted.length) {
    if (i + 2 >= sorted.length) break;
    if (sorted[i + 1]! !== sorted[i]! + 1 || sorted[i + 2]! !== sorted[i]! + 2) { i++; continue; }
    const seg: number[] = [sorted[i]!, sorted[i + 1]!, sorted[i + 2]!];
    let j = i + 3;
    while (j < sorted.length && sorted[j]! === sorted[j - 1]! + 1) { seg.push(sorted[j]!); j++; }
    if (seg.length >= minCount) all.push(seg);
    i = j;
  }
  return all;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx]!;
}

// ---------------------------------------------------------------------------
// Note extraction
// ---------------------------------------------------------------------------

function getNotesInRange(
  beatmap: ParsedBeatmap,
): Array<{ col: number; time: number }> {
  const notes: Array<{ col: number; time: number }> = [];
  for (let i = 0; i < beatmap.noteStarts.length; i++) {
    const ns = beatmap.noteStarts[i]!;
    const ne = beatmap.noteEnds[i]!;
    const col = beatmap.columns[i]!;
    const isLN = (beatmap.noteTypes[i]! & 128) !== 0;
    if (ns >= beatmap.firstNote! && ns < beatmap.lastNote!) {
      notes.push({ col, time: ns });
    }
    if (isLN && ne > ns && ne >= beatmap.firstNote! && ne < beatmap.lastNote!) {
      notes.push({ col, time: ne });
    }
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Compute a single tier
// ---------------------------------------------------------------------------

function computeTier(
  positionSets: number[][],
  bridgeCountdown: number,
): AnchorTier {
  const p100Segs: number[] = [];
  for (const pos of positionSets) {
    for (const s of findSegmentsBridge(pos, 3, bridgeCountdown)) {
      p100Segs.push(s.length);
    }
  }
  p100Segs.sort((a, b) => b - a);

  const strictSegs: number[] = [];
  for (const pos of positionSets) {
    for (const s of findSegmentsStrict(pos, 3)) {
      strictSegs.push(s.length);
    }
  }
  strictSegs.sort((a, b) => b - a);

  const p100 = p100Segs.length > 0 ? p100Segs[0]! / 4 : 0;
  const strictP90 = strictSegs.length > 0 ? percentile(strictSegs, 0.1) : 0;
  const strictP50 = strictSegs.length > 0 ? percentile(strictSegs, 0.5) : 0;
  const strictMax = strictSegs.length > 0 ? strictSegs[0]! : 0;

  return {
    p100,
    p90: strictP90 / 4,
    p50: strictP50 / 4,
    p90Count: strictSegs.length > 0
      ? strictSegs.filter(s => s >= strictP90 && s < strictMax).length : 0,
    p50Count: strictSegs.length > 0
      ? strictSegs.filter(s => s >= strictP50 && s < strictP90).length : 0,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeAnchorMetrics(
  beatmap: ParsedBeatmap,
  gridAnalysis: GridAnalysisResult | null,
): AnchorMetrics {
  let baseBPM = 120;
  let isJackType = false;
  if (gridAnalysis && gridAnalysis.bpmKeyTypes.length > 0) {
    const top = gridAnalysis.bpmKeyTypes.reduce((a, b) => a.cellCount > b.cellCount ? a : b);
    baseBPM = top.bpm;
    const kt = top.keyType.toLowerCase();
    isJackType = kt.includes("chordjack") || kt.includes("minijack")
      || kt.includes("longjack") || kt.includes("cj") || kt.includes("mj");
  }

  const sfBPM = isJackType ? baseBPM : baseBPM / 2;
  const shBPM = isJackType ? baseBPM * 2 : baseBPM;
  const sf16 = (60000 / sfBPM) / 4;
  const sh16 = (60000 / shBPM) / 4;

  const allNotes = getNotesInRange(beatmap);

  // SF: per-column
  const sfColPositions: number[][] = [[], [], [], []];
  for (const n of allNotes) sfColPositions[n.col]!.push(Math.round(n.time / sf16));
  for (const c of sfColPositions) c.sort((a, b) => a - b);
  const sf = computeTier(sfColPositions, 4);

  // SH: left (0,1) + right (2,3)
  const lhNotes = allNotes.filter(n => n.col === 0 || n.col === 1)
    .map(n => Math.round(n.time / sh16)).sort((a, b) => a - b);
  const rhNotes = allNotes.filter(n => n.col === 2 || n.col === 3)
    .map(n => Math.round(n.time / sh16)).sort((a, b) => a - b);
  const sh = computeTier([lhNotes, rhNotes], 4);

  // DH: 4 paired combinations
  const pairs: [number, number][] = [[0, 2], [1, 3], [1, 2], [0, 3]];
  const dhPositionSets: number[][] = [];
  for (const [ca, cb] of pairs) {
    const pn = allNotes.filter(n => n.col === ca || n.col === cb)
      .map(n => Math.round(n.time / sh16)).sort((a, b) => a - b);
    dhPositionSets.push(pn);
  }
  const dh = computeTier(dhPositionSets, 4);

  return { sf, sh, dh, isJackType, sfBPM, shBPM };
}
