// ============================================================
// estimate.ts — AKUTA difficulty estimate (v4)
//
// RC channel:
//   very-low band (sunny < 4): sunny regression overestimates
//     low charts (a .2 Dan chart got ~2 dan), so the sunny term is
//     dropped below sunny 4 in favor of a key-type model fitted on
//     19 user labels (MAE 0.51): jack/stream med width + share + bpm.
//     Charts with almost no keys (jackMedW<5, streamMedW<1.0) are
//     mapped directly into .1/.2/.3 Dan territory.
//   low band (sunny 4-5.5): user-label line (n=50, MAE 0.59)
//     RC = -4.1412 + 1.9528*sunny + 1.2785*jackShare - 3.1167*lnRatio
//   high band (sunny >= 6.5): benchmark full-band multi-feature fit,
//     anchored continuous, smooth 1-dan blend across 5.5 -> 6.5
//
// LN channel (lnRatio > 15%, benchmark n=102, user-swapped truth):
//   LN = -11.0351 + 2.6623*sunny + 0.0076*bpm + 0.0014*durationSec
//      + 0.1539*wildcardScore + 0.0539*technicalScore
//      - 0.0114*coordinationScore - 0.0101*densityScore
//      - 0.0021*lnColumnLock
//   Pool scores carry the LN-dan signature: wildcard/technical charts
//   (e.g. Stage 3 marathon packs) get the extra difficulty sunny misses.
//
// Naming: RC dan are governed by the Reform system — every RC value
// from .1 dan up to eta (17) renders as "RC Reform N dan tier"; above
// eta no Reform prefix is attached. Greek names apply from Alpha (11).
// ============================================================

import type { DifficultyResult } from "./types/result.js";
import type { CellResult } from "./custom/gridAnalysis.js";

export interface EstimateResult {
  /** "rc" | "ln" | "vibro" */
  mode: "rc" | "ln" | "vibro";
  /** RC estimate (rc mode; also filled for ln mode as the rice analog) */
  rc: number | null;
  /** LN estimate (ln mode only) */
  ln: number | null;
}

const LN_RATIO_THRESHOLD = 0.15;
const RC_CUT = 5.5;
const KEY_CUT = 3.5;
const KEY_BLEND = 4.5;

// ---- RC very-low band key-type model (sunny < 4, n=19 user labels) ----
// Sunny regression overestimates low charts (a .2 Dan chart got ~2 dan),
// so below sunny 4 the sunny term is dropped in favor of key-type
// features. Charts with almost no keys land in .1/.2/.3 Dan territory.
// The key-type estimate is capped by the user line (rcLow): it only
// pulls DOWN overestimates, never pushes above the sunny-based line.
const RCK = {
  a: -2.3712,
  jackMedW: 0.19282,
  streamMedW: 2.79767,
  jackShare: 2.71865,
  bpm: 0.00382,
};

// ---- RC low band (user labels) ----
const RCL = { a: -4.1412, b: 1.9528, jackK: 1.2785, lnK: -3.1167 };
// ---- RC high band full model (benchmark full-band fit, all terms) ----
const RCH = {
  a: -3.5155,
  sunny: 2.0466,
  lnRatio: -8.1210,
  jackShare: -0.4004,
  durationSec: 0.0006,
  jackMaxW: 0.0037,
  jackMaxPeak: 0.0524,
  jackMedW: 0.0037,
  streamMaxW: 0.0261,
  streamMaxPeak: 0.0293,
  streamMedW: 0.0261,
  staminaMedTotal: 0.00001,
  staminaStretchRatio: -0.9314,
  staminaSwitchFreq: 0.0343,
  techTrills24: 0.0179,
};
// ---- LN channel (user-swapped truth fit) ----
const LN = {
  a: -11.0351,
  sunny: 2.6623,
  bpm: 0.0076,
  durationSec: 0.0014,
  wildcard: 0.1539,
  technical: 0.0539,
  coordination: -0.0114,
  density: -0.0101,
  columnLock: -0.0021,
};
const LO = -3, HI = 20;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export interface Features {
  sunny: number;
  bpm: number;
  lnRatio: number;
  jackShare: number;
  jackMaxW: number;
  jackMaxPeak: number;
  jackMedW: number;
  streamMaxW: number;
  streamMaxPeak: number;
  streamMedW: number;
  staminaMedTotal: number;
  staminaStretchRatio: number;
  staminaSwitchFreq: number;
  techTrills24: number;
  durationSec: number;
}

function parseTrills24(s: string): number {
  let total = 0;
  for (const part of s.split(/\s+/)) {
    const m = part.match(/^(\d+)×(\d+)$/);
    if (m && Number(m[1]) === 24) total += Number(m[2]);
  }
  return total;
}

export function extractFeatures(r: DifficultyResult): Features {
  const c = r.custom;
  const ga = r.gridAnalysis;
  const cells = ga ? ga.cells : ([] as CellResult[]);
  const nonBreak = cells.filter((cell) => cell.category !== "break").length;
  let jackCells = 0;
  let jackMaxW = 0, jackMaxPeak = 0, jackMedW = 0, jc = 0;
  let streamMaxW = 0, streamMaxPeak = 0, streamMedW = 0, sc = 0;
  if (ga) {
    for (const seg of ga.segments) {
      if (seg.cells.length === 0) continue;
      if (seg.category === "jack") {
        jackCells += seg.cells.length;
        const m = seg.grade.match(/\((\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\)/);
        if (m) {
          const mx = Number(m[1]);
          const md = m[2] != null ? Number(m[2]) : mx;
          jackMaxW += mx * seg.cells.length;
          jackMedW += md * seg.cells.length;
          jc += seg.cells.length;
          if (mx > jackMaxPeak) jackMaxPeak = mx;
        }
      } else if (seg.category === "stream") {
        const m = seg.grade.match(/\((\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\)/);
        if (m) {
          const mx = Number(m[1]);
          const md = m[2] != null ? Number(m[2]) : mx;
          streamMaxW += mx * seg.cells.length;
          streamMedW += md * seg.cells.length;
          sc += seg.cells.length;
          if (mx > streamMaxPeak) streamMaxPeak = mx;
        }
      }
    }
  }
  const sunny = r.sunny.star > 0 ? r.sunny.star : 0;
  return {
    sunny,
    bpm: r.meta.bpm ?? 0,
    lnRatio: r.meta.lnRatio ?? 0,
    jackShare: nonBreak > 0 ? jackCells / nonBreak : 0,
    jackMaxW: jc > 0 ? jackMaxW / jc : 0,
    jackMaxPeak,
    jackMedW: jc > 0 ? jackMedW / jc : 0,
    streamMaxW: sc > 0 ? streamMaxW / sc : 0,
    streamMaxPeak,
    streamMedW: sc > 0 ? streamMedW / sc : 0,
    staminaMedTotal: c.stamina.medTotalTime,
    staminaStretchRatio: c.stamina.stretchRatio,
    staminaSwitchFreq: c.stamina.switchFrequency,
    techTrills24: parseTrills24(c.tech.rollTrill.trills),
    durationSec: cells.length > 0 ? (cells[cells.length - 1]!.endTime - cells[0]!.startTime) / 1000 : 0,
  };
}

function rcKey(f: Features): number {
  // near-empty key grid -> the .1/.2/.3 Dan territory (Reform 1-3 Intro)
  if (f.jackMedW < 5 && f.streamMedW < 1.0) {
    return Math.min(-2 + f.jackMedW * 0.43 + f.streamMedW * 0.3, 0.1);
  }
  return RCK.a
    + RCK.jackMedW * f.jackMedW
    + RCK.streamMedW * f.streamMedW
    + RCK.jackShare * f.jackShare
    + RCK.bpm * f.bpm;
}

function rcLow(f: Features): number {
  return RCL.a + RCL.b * f.sunny + RCL.jackK * f.jackShare + RCL.lnK * f.lnRatio;
}

function rcHigh(f: Features): number {
  return RCH.a
    + RCH.sunny * f.sunny
    + RCH.lnRatio * f.lnRatio
    + RCH.jackShare * f.jackShare
    + RCH.durationSec * f.durationSec
    + RCH.jackMaxW * f.jackMaxW
    + RCH.jackMaxPeak * f.jackMaxPeak
    + RCH.jackMedW * f.jackMedW
    + RCH.streamMaxW * f.streamMaxW
    + RCH.streamMaxPeak * f.streamMaxPeak
    + RCH.streamMedW * f.streamMedW
    + RCH.staminaMedTotal * f.staminaMedTotal
    + RCH.staminaStretchRatio * f.staminaStretchRatio
    + RCH.staminaSwitchFreq * f.staminaSwitchFreq
    + RCH.techTrills24 * f.techTrills24;
}

function rcEstimate(f: Features): number {
  // very-low band: key-type model (no sunny term), capped by the user
  // line so it only corrects overestimates; smooth blend into the
  // user-perception line across sunny 3.5 -> 4.5, then the low-band line
  // until 5.5, and a 1-dan blend into the benchmark model up to 6.5
  const key = Math.min(rcKey(f), rcLow(f));
  if (f.sunny <= KEY_CUT) return key;
  if (f.sunny <= KEY_BLEND) {
    const w = (f.sunny - KEY_CUT) / (KEY_BLEND - KEY_CUT);
    return (1 - w) * key + w * rcLow(f);
  }
  if (f.sunny <= RC_CUT) return rcLow(f);
  if (f.sunny >= RC_CUT + 1) return rcHigh(f);
  const w = f.sunny - RC_CUT;
  return (1 - w) * rcLow(f) + w * rcHigh(f);
}

function lnHigh(r: DifficultyResult, f: Features): number {
  const ln = r.custom.ln;
  return LN.a
    + LN.sunny * f.sunny
    + LN.bpm * r.meta.bpm
    + LN.durationSec * f.durationSec
    + LN.wildcard * ln.wildcardPoolScore
    + LN.technical * ln.technicalPoolScore
    + LN.coordination * ln.coordinationPoolScore
    + LN.density * ln.densityPoolScore
    + LN.columnLock * ln.columnLockCount;
}

function lnEstimate(r: DifficultyResult, f: Features): number {
  return lnHigh(r, f);
}

export function estimateDifficulty(r: DifficultyResult): EstimateResult {
  const f = extractFeatures(r);

  // vibro: reference difficulty still computed (mode flag stays "vibro",
  // the overlay shows its own Vibro badge above the value)
  const vibro = r.gridAnalysis?.vibroLabel ?? "";
  const isVibro = vibro.includes("Vibro(");
  if (isVibro) {
    return { mode: "vibro", rc: clamp(rcEstimate(f), LO, HI), ln: null };
  }

  if (f.lnRatio > LN_RATIO_THRESHOLD) {
    const lnEst = clamp(lnEstimate(r, f), LO, HI);
    const rcEst = clamp(rcEstimate(f), LO, HI);
    return { mode: "ln", rc: rcEst, ln: lnEst };
  }

  const rc = clamp(rcEstimate(f), LO, HI);
  return { mode: "rc", rc, ln: null };
}

// Greek naming above 10 dan, following the benchmark reference naming:
// 11 Alpha, 12 Beta, ..., 20 kappa, beyond that plain numbers.
const GREEK_BASE: Record<number, string> = {
  11: "Alpha", 12: "Beta", 13: "Gamma", 14: "Delta", 15: "Epsilon",
  16: "Zeta", 17: "Eta", 18: "Theta", 19: "iota", 20: "kappa",
};

/**
 * Format one estimate as "N dan tier (value)".
 * RC follows the Reform system: .1/.2/.3 dan (Reform 1-3 Intro,
 * difficulty 3 < 2 < 1) up to eta (17) render with the "RC Reform"
 * prefix; above eta no Reform prefix. Greek names from Alpha (11).
 * LN keeps plain digits and shows "below ln 1" under 1 dan.
 */
export function formatDanValue(v: number | null, isLN: boolean): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (isLN) {
    if (v < 1) return `LN below ln 1 (${v.toFixed(2)})`;
    const base = Math.round(v);
    const frac = v - base;
    const tier = frac <= -0.125 ? "low" : frac <= 0.125 ? "mid" : "high";
    return `LN ${base} dan ${tier} (${v.toFixed(2)})`;
  }

  // RC: Reform system, lowest dan is .1 (Reform 1 Intro)
  if (v < 1) {
    const b = Math.round(v);
    if (b <= -3) return "RC below .1 Dan";
    if (b <= 0) {
      const name = b === -2 ? ".1" : b === -1 ? ".2" : ".3";
      const frac = v - b;
      const tier = frac <= -0.125 ? "low" : frac <= 0.125 ? "mid" : "high";
      return `RC Reform ${name} dan ${tier} (${v.toFixed(2)})`;
    }
  }

  const base = Math.round(v);
  const frac = v - base;
  const tier = frac <= -0.125 ? "low" : frac <= 0.125 ? "mid" : "high";
  const name = base >= 11 ? (GREEK_BASE[base] ?? String(base)) : String(base);
  const prefix = base <= 17 ? "RC Reform" : "RC";
  return `${prefix} ${name} dan ${tier} (${v.toFixed(2)})`;
}

/** Full line for the overlay: "RC ..." and, for LN charts, ", LN ..." */
export function formatAkuta(est: EstimateResult): string {
  const parts: string[] = [];
  if (est.rc != null) parts.push(formatDanValue(est.rc, false));
  if (est.ln != null) parts.push(formatDanValue(est.ln, true));
  return parts.join(", ") || "—";
}

/** Format a numeric difficulty as dan + subtier label, e.g. 2.75 -> "3 low" */
export function formatDan(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const base = Math.round(v);
  const frac = v - base;
  let sub: string;
  if (frac <= -0.125) sub = "low";
  else if (frac <= 0.125) sub = "mid";
  else sub = "high";
  return `${base} ${sub} (${v.toFixed(2)})`;
}

