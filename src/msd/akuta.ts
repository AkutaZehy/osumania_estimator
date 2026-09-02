// ============================================================
// MSD engine — Akuta extension skillsets
// Extends the 0.72.3 engine with three first-class skillsets computed with
// the SAME machinery as the core 8: per-interval base difficulty vectors in
// the engine's nps units (notes × finalscaler × 1.6), written into the
// extension slots of base_adj_diff / base_diff_for_stam_mod, then solved by
// the same Chisel point-loss search with the same stamina rerun, ssr caps,
// grindscaler and the same sigmoidal aggregate_skill for Overall.
//
//   JackChord (8)      — chord-jack density: notes of hand-chord rows that are
//                        row-adjacent to another hand-chord row (CJ chains)
//   JackTech (9)       — 卡手度: rows continuing a 3+ same-column jack run
//   LNCoordination(10) — taps weighted by mean simultaneously-held LN columns
//                        of the hand + LN releases
//
// The MSD 8 values are produced by CalcMain untouched (wasm parity harness
// stays valid); the extension only reads the prepared Calc and fills slots
// 8-10, then aggregates all 10 skillsets (Overall slot excluded) into the
// Akuta Overall exactly like CalcMain aggregates its 8.
// ============================================================

import {
  AkutaSkillset,
  NUM_SKILLSET,
  Skillset,
  type NoteInfo,
} from "./enums.js";
import { finalscaler, min_rating } from "./enums.js";
import { aggregate_skill, downscale_low_accuracy_scores } from "./num.js";
import { Calc } from "./calc.js";
import { CalcMain, Chisel } from "./mina.js";
import type { ParsedBeatmap } from "../types/beatmap.js";

/** column → hand (4k: cols 0-1 left / 2-3 right, matching hand_col_ids) */
function colHand(col: number): number {
  return col < 2 ? 0 : 1;
}

/** engine nps-unit conversion for a per-interval note count */
function notesToDiff(notes: number): number {
  return notes * finalscaler * 1.6;
}

/** v1 base scalers for the extension skillsets (calibration knobs).
 * JackChord is calibrated against MSD's Chordjack on chordjack-dominant
 * charts (Break/CG904B should land at their MSD CJ values, not the 40 cap). */
export const AKUTA_BASE_SCALER: Record<number, number> = {
  // 0.70: sweep vs wasm Chordjack on chordjack-dominant fixtures — Break
  // 31.9/32.2, CG904B 31.7/35.2, [42] 33.1/30.3, meanAbsErr 2.60
  [AkutaSkillset.JackChord]: 0.70,
  [AkutaSkillset.JackTech]: 1.0,
  // 0.48: dan-anchor calibration over the 4K LN Dan Courses v2 packs —
  // 1st..10th mean 5.9..25.4 (10th target 24-27), kana tiers land 27-36
  [AkutaSkillset.LNCoordination]: 0.48,
};

/** LN spans in rate-scaled seconds, attributed to the holding hand */
interface LNSpan {
  start: number; // scaled seconds
  end: number; // scaled seconds
  hand: number;
}

function collectLNSpans(parsed: ParsedBeatmap, rate: number): LNSpan[] {
  const spans: LNSpan[] = [];
  const { columns, noteStarts, noteEnds, noteTypes } = parsed;
  const len = Math.min(columns.length, noteStarts.length, noteTypes.length);
  for (let i = 0; i < len; i++) {
    if ((noteTypes[i]! & 128) === 0) continue; // not an LN head
    const end = noteEnds[i] ?? noteStarts[i]!;
    if (end <= noteStarts[i]!) continue;
    spans.push({
      start: noteStarts[i]! / 1000 / rate,
      end: end / 1000 / rate,
      hand: colHand(columns[i]!),
    });
  }
  return spans;
}

/**
 * Per-interval, per-hand base difficulty for the three extension skillsets.
 * Scans calc.adj_ni in global row order (jack adjacency is row-adjacency, so
 * runs/chains carry across interval boundaries) and integrates LN spans.
 */
function computeExtensionBases(calc: Calc, spans: LNSpan[]): { bases: number[][][] } {
  const numitv = calc.numitv;
  // [skillset][hand][itv]
  const bases: number[][][] = [
    Array.from({ length: 2 }, () => new Array(numitv).fill(0)), // JackChord
    Array.from({ length: 2 }, () => new Array(numitv).fill(0)), // JackTech
    Array.from({ length: 2 }, () => new Array(numitv).fill(0)), // LNCoordination
  ];
  const taps: number[][] = [new Array(numitv).fill(0), new Array(numitv).fill(0)];
  const releases: number[][] = [new Array(numitv).fill(0), new Array(numitv).fill(0)];
  const heldTime: number[][] = [new Array(numitv).fill(0), new Array(numitv).fill(0)];

  // --- LN span integration (held time + releases) ---
  for (const span of spans) {
    const firstItv = Math.max(0, Math.floor(span.start / 0.5));
    const lastItv = Math.min(numitv - 1, Math.floor((span.end - 1e-9) / 0.5));
    for (let itv = firstItv; itv <= lastItv; itv++) {
      const lo = itv * 0.5;
      const hi = lo + 0.5;
      const overlap = Math.min(span.end, hi) - Math.max(span.start, lo);
      if (overlap > 0) heldTime[span.hand]![itv]! += overlap;
    }
    const relItv = Math.floor(span.end / 0.5);
    if (relItv >= 0 && relItv < numitv) releases[span.hand]![relItv]! += 1;
  }

  // --- row scan (global row order: itv-major, row-minor) ---
  const runLen = [0, 0, 0, 0]; // per column, current same-column row run
  let prevRowChordNotes = 0; // row_notes of the previous chord row (0 = none)

  for (let itv = 0; itv < numitv; ++itv) {
    for (let row = 0; row < calc.itv_size[itv]!; ++row) {
      const ri = calc.adj_ni[itv]![row]!;

      for (const hand of [0, 1] as const) {
        taps[hand]![itv]! += ri.hand_counts[hand]!;
      }

      // JackChord: full-row chords row-adjacent to another full-row chord
      // that shares at least one column (ceejay's chord notion + the shared
      // column is what makes it a chordjack rather than plain jumpstream)
      if (ri.row_count >= 2 && prevRowChordNotes > 0 && (ri.row_notes & prevRowChordNotes) !== 0) {
        bases[0]![0]![itv]! += ri.hand_counts[0]!;
        bases[0]![1]![itv]! += ri.hand_counts[1]!;
      }
      prevRowChordNotes = ri.row_count >= 2 ? ri.row_notes : 0;

      // JackTech: same-column run continuation (row adjacency)
      for (let col = 0; col < 4; col++) {
        if ((ri.row_notes & (1 << col)) !== 0) {
          runLen[col]!++;
          if (runLen[col]! >= 3) {
            bases[1]![colHand(col)]![itv]! += 1;
          }
        } else {
          runLen[col] = 0;
        }
      }
    }
  }

  // --- assemble final per-interval diffs in engine units ---
  for (let itv = 0; itv < numitv; itv++) {
    for (const hand of [0, 1] as const) {
      // LN coordination isolates the LN component: taps under simultaneous
      // holds + releases. Charts without LNs stay at the floor.
      const heldMean = heldTime[hand]![itv]! / 0.5;
      bases[2]![hand]![itv] =
        (taps[hand]![itv]! * heldMean + releases[hand]![itv]!) * finalscaler * 1.6;
      bases[0]![hand]![itv] = notesToDiff(bases[0]![hand]![itv]!);
      bases[1]![hand]![itv] = notesToDiff(bases[1]![hand]![itv]!);
    }
  }

  return { bases };
}

export interface AkutaResult {
  /** full 11-slot vector: 0 Overall, 1-7 MSD skillsets, 8-10 extensions */
  values: number[];
  overall: number;
}

/**
 * Solve the Akuta score for a chart.
 * Runs the untouched MSD CalcMain (8 skillsets + its Overall), then chisels
 * the three extension skillsets with the same point-loss/stamina machinery,
 * and aggregates all 10 skillsets with the same sigmoid into AkutaOverall.
 */
export function solveAkuta(
  ni: readonly NoteInfo[],
  rate: number,
  goal: number,
  calc: Calc,
  spans: LNSpan[],
): AkutaResult {
  const msdValues = CalcMain(ni, rate, goal, calc);

  const values = new Array<number>(NUM_SKILLSET + 3).fill(min_rating);
  for (let i = 0; i < NUM_SKILLSET; ++i) values[i] = msdValues[i]!;

  if (ni.length > 1 && msdValues[Skillset.Stream]! > 0) {
    const { bases } = computeExtensionBases(calc, spans);

    // write extension bases into the engine slots (stam base = same vector)
    for (let e = 0; e < 3; e++) {
      const ss = AkutaSkillset.JackChord + e;
      const scaler = AKUTA_BASE_SCALER[ss]!;
      for (const hand of [0, 1] as const) {
        for (let i = 0; i < calc.numitv; i++) {
          const v = bases[e]![hand]![i]! * scaler;
          calc.base_adj_diff[hand]![ss]![i] = v;
          calc.base_diff_for_stam_mod[hand]![ss]![i] = v;
        }
      }
    }

    // first pass, no stamina
    const firstPass = new Array<number>(3).fill(0);
    for (let e = 0; e < 3; e++) {
      const ss = AkutaSkillset.JackChord + e;
      firstPass[e] = Chisel(calc, 0.1, 10.24, goal, ss, false);
    }

    // stamina rerun keyed to the extension-dominant base (CalcMain semantics
    // restricted to the extension family; the MSD 8 stay untouched)
    const extBase = Math.max(firstPass[0]!, firstPass[1]!, firstPass[2]!);
    for (let e = 0; e < 3; e++) {
      const ss = AkutaSkillset.JackChord + e;
      let v = firstPass[e]!;
      if (v > extBase * 0.9) {
        v = Chisel(calc, v * 0.9, 0.32, goal, ss, true);
      }
      // ssr treatment, mirroring CalcMain
      v = downscale_low_accuracy_scores(v, Math.min(goal, 0.965));
      v = Math.min(v, 40.0);
      v *= calc.grindscaler;
      values[ss] = v;
    }
  }

  // AkutaOverall: same sigmoidal aggregate over the 10 skillsets
  // (Overall slot excluded, exactly like CalcMain aggregates its 8)
  const aggInput: number[] = [];
  for (let i = Skillset.Stream; i <= Skillset.Technical; i++) aggInput.push(values[i]!);
  for (let ss = AkutaSkillset.JackChord; ss <= AkutaSkillset.LNCoordination; ss++) {
    aggInput.push(values[ss]!);
  }
  let highest = -1.0;
  for (const v of aggInput) if (v > highest) highest = v;
  const agg = aggregate_skill(aggInput, 0.25, 1.11, 0.0, 10.24);
  values[Skillset.Overall] = agg > highest ? agg : highest;

  return { values, overall: values[Skillset.Overall]! };
}

// ---- public entry ----

import { OsuFileParser } from "../parser/osuFileParser.js";
import { buildNoteInfo } from "./rows.js";

/**
 * Solve from an already-parsed (and mod-transformed) beatmap — the analyzer
 * applies IN/HO on its parser before calling this, so Hold Off / Invert affect
 * the score the same way they affect every other metric.
 */
export function solveAkutaFromParsed(
  parsed: ParsedBeatmap,
  rate = 1.0,
  goal = 0.93,
): AkutaResult {
  if (parsed.columnCount !== 4) {
    throw new Error(`unsupported keycount ${parsed.columnCount}`);
  }
  const ni = buildNoteInfo(parsed, rate);
  const calc = new Calc();
  const spans = collectLNSpans(parsed, rate);
  return solveAkuta(ni, rate, goal, calc, spans);
}

/** Parse + solve in one call (no IN/HO mods — tests and standalone use). */
export function solveAkutaFromOsuText(
  osuText: string,
  rate = 1.0,
  goal = 0.93,
): AkutaResult {
  const parser = new OsuFileParser(osuText);
  parser.process();
  return solveAkutaFromParsed(parser.getParsedData(), rate, goal);
}
