// ============================================================
// Grid Analysis — density grades & key type classification
// ============================================================
// Single source of truth for density grade bands (jack + stream) and the
// main-key-type selection table. The JACK/STREAM panel grade strings, the
// no-grid fallback paths (jackAnalysis/streamAnalysis) and the stream-run
// grades all derive from the band functions here.

import type { BPMKeyType } from "./types.js";

// ---------------------------------------------------------------------------
// Density grades
// ---------------------------------------------------------------------------

/** Jack density band name from total notes in the 4-row window. */
export function jackGradeBand(maxWindowNotes: number): string {
  if (maxWindowNotes <= 4) return "Mini";
  if (maxWindowNotes <= 7) return "Low";
  if (maxWindowNotes <= 11) return "Mid";
  return "Dense";
}

/** Stream density band name from avg notes per row. */
export function streamGradeBand(avgPerRow: number): string {
  if (avgPerRow <= 1.125) return "Single";
  if (avgPerRow <= 1.25) return "Light";
  if (avgPerRow <= 1.5) return "Mid";
  if (avgPerRow < 2.0) return "Dense";
  if (avgPerRow === 2.0) return "Full";
  return "Heavy";
}

/**
 * Jack density grade: based on total notes in 4-row window.
 */
export function gradeJack(maxWindowNotes: number, medWindowNotes: number): string {
  const m = Number.isInteger(maxWindowNotes) ? maxWindowNotes.toString() : maxWindowNotes.toFixed(1);
  const d = medWindowNotes.toFixed(1);
  return `${jackGradeBand(maxWindowNotes)} (${m}/${d})`;
}

/**
 * Stream density grade: based on avg notes per row.
 */
export function gradeStream(maxWindowNotes: number, medWindowNotes: number): string {
  const avgPerRow = maxWindowNotes / 4;
  const m = Number.isInteger(maxWindowNotes) ? maxWindowNotes.toString() : maxWindowNotes.toFixed(1);
  const d = medWindowNotes.toFixed(1);
  return `${streamGradeBand(avgPerRow)} (${m}/${d})`;
}

// ---------------------------------------------------------------------------
// Per-cell key type classification
// ---------------------------------------------------------------------------

interface KeyTypeResult {
  keyType: string;
  grade: string;
}

export function classifyJack(totalNotes: number): KeyTypeResult {
  const medNotes = totalNotes; // In grid mode, max=med since it's a single window
  const grade = gradeJack(totalNotes, medNotes);
  // A4 tier: ≤5 Mini / 6-7 Low / 8-10 Mid / ≥11 High
  if (totalNotes <= 5) return { keyType: "Minijack", grade };
  if (totalNotes <= 7) return { keyType: "Low Chordjack", grade };
  if (totalNotes <= 10) return { keyType: "Mid Chordjack", grade };
  return { keyType: "High Chordjack", grade };
}

export function classifyStream(
  totalNotes: number,
  maxBeat: number,
  _rowNotes: number[],
): KeyTypeResult {
  const avgPerRow = totalNotes / 4;
  const grade = gradeStream(totalNotes, totalNotes);

  // Determine JS vs HS by maxBeat
  const isHS = maxBeat >= 3;

  // Roll vs Trill: single-note-per-row patterns
  // If consecutive non-empty rows alternate columns → trill, else roll
  let isRoll = false;
  if (avgPerRow <= 1.0 && maxBeat === 1) {
    isRoll = true; // default singles → rolls
  }

  if (avgPerRow <= 1.0) {
    if (isRoll) return { keyType: "Rolls", grade };
    return { keyType: "Minitrills", grade };
  }

  if (avgPerRow < 1.25) {
    return { keyType: "Low Jumpstream", grade };
  }

  if (isHS) {
    // Only classify as handstream when consistently dense (avgPerRow ≥ 1.75 = 3121).
    // 3111 patterns (avgPerRow = 1.5, one row with 3 notes = chord in dense JS)
    // are common in dense jumpstream and should NOT be classified as handstream.
    if (avgPerRow >= 2.0) return { keyType: "Full Handstream", grade };
    if (avgPerRow >= 1.75) return { keyType: "High Handstream", grade };
  }
  // Jumpstream path (also covers sparse HS patterns below handstream threshold)
  if (avgPerRow >= 2.0) return { keyType: "Full Jumpstream", grade };
  if (avgPerRow >= 1.5) return { keyType: "High Jumpstream", grade };
  if (avgPerRow > 1.25) return { keyType: "Mid Jumpstream", grade };
  return { keyType: "Low Jumpstream", grade };
}

/**
 * Classify a (gridTotalNotes, maxBeat) pair into a key type string.
 * avg = notes/4. HS path needs maxBeat ≥ 3 (≥1.75 → Full HS; 1.5–1.75 → High;
 * ≈1.5 → Mid; 1.25–1.5 → Low; below that too dilute for HS). JS path:
 * ≥2.0 Full JS, ≥1.5 High JS, 1.25–1.5 Mid JS, ≈1.25 Low JS, 1.125–1.25
 * High Stream (大乱), below Single Stream (单乱).
 */
export function classifyStreamDensity(notes: number, maxBeat: number): string {
  const avg = notes / 4;

  // HS path (maxBeat ≥ 3): bands per the docblock above
  if (maxBeat >= 3) {
    if (avg >= 1.75) return "Full Handstream";  // 1.75+ → Full HS
    if (avg > 1.5 + 0.001) return "High Handstream"; // 1.5~1.75 → High HS (run level)
    if (Math.abs(avg - 1.5) < 0.001) return "Mid Handstream"; // ≈1.5 → Mid HS
    if (avg >= 1.25) return "Low Handstream";   // 1.25~1.5 → Low HS
    // avg < 1.25: too dilute for HS, fall through to JS path
  }

  // JS / pure stream path
  // Per-cell gridTotalNotes is integer (4,5,6,7,8 → avg=1.0,1.25,1.5,1.75,2.0),
  // so Mid JS (1.25~1.5) and High Stream (1.125~1.25) only appear at run level.
  // Use tolerance for floating point === comparison.
  if (avg >= 2.0) return "Full Jumpstream";
  if (avg >= 1.5) return "High Jumpstream";     // 1.5~2 → High JS
  if (avg > 1.25 + 0.001) return "Mid Jumpstream"; // >1.25~1.5 → Mid JS
  if (Math.abs(avg - 1.25) < 0.001) return "Low Jumpstream"; // ≈1.25 → Low JS
  if (avg >= 1.125) return "High Stream";       // 1.125~1.25 → 大乱
  return "Single Stream";                        // <1.125 → 单乱
}

/**
 * Run-level density grade: uses the true mean density (total notes / total rows)
 * across the entire run, giving a continuous value instead of discrete P75.
 */
export function streamRunGrade(results: Array<{ notes: number; maxBeat: number }>): string {
  if (results.length === 0) return "None";
  const totalNotes = results.reduce((s, r) => s + r.notes, 0);
  const totalRows = results.length * 4;
  const meanDensity = totalNotes / totalRows;
  return `${streamGradeBand(meanDensity)} (${meanDensity.toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// Main key type selection (Phase 4)
// ---------------------------------------------------------------------------
//
// Merge (non-recursive, adjacent only):
//   HS→HS same chain, HS also feeds into JS at same/adjacent level
//   CJ: High→Mid, Mid→Low, Low→Minijack (no skipping)
//   Stream cascade: Full→High→Mid→Low→SS
// Sort: effBPM group (jack×2) → tier → insertion order (HS > JS > CJ)
// First with merged cells ≥ N wins (adaptive threshold by eff BPM).

const MERGE: Record<string, string[]> = {
  "Full Handstream":  [],  // standalone, but feeds into lower types as sub
  "High Handstream":  ["Full Handstream"],
  "High Jumpstream":  ["Full Handstream", "Full Jumpstream"],
  "Mid Handstream":   ["Full Handstream", "High Handstream"],
  "Mid Jumpstream":   ["Full Handstream", "Full Jumpstream", "High Handstream", "High Jumpstream"],
  "Low Handstream":   ["Mid Handstream"],
  "Low Jumpstream":   ["Mid Handstream", "Mid Jumpstream"],
  "Single Stream":    ["Low Handstream", "Low Jumpstream", "Rolls", "Minitrills", "High Stream"],
  // Jack: adjacent merge only
  "Mid Chordjack":    ["High Chordjack"],
  "Low Chordjack":    ["Mid Chordjack"],
  "Minijack":         ["Low Chordjack"],
};

export const LN_TYPES = new Set(["LN Inverse", "LN Unknown", "Ouroboros", "LN Tree", "Timing Hell", "Speedy WC", "Jacky WC"]);

const JACK_TYPES = new Set(["High Chordjack", "Mid Chordjack", "Low Chordjack", "Minijack", "Jacky Tech"]);

const TIER: Record<string, number> = {
  "Full Handstream": 1, "Full Jumpstream": 1,
  "High Handstream": 1, "High Jumpstream": 1, "High Chordjack": 1,
  "Mid Handstream": 2, "Mid Chordjack": 2,
  "Low Handstream": 3, "Mid Jumpstream": 3, "Low Jumpstream": 3, "Low Chordjack": 3,
  "Single Stream": 4, "Minijack": 4,
  "Rolls": 5, "Minitrills": 5, "High Stream": 5, "Speedy Tech": 5, "Jacky Tech": 5,
};

/**
 * Pick the map's main key type from aggregated per-type BPM entries:
 * merge adjacent tiers, then first candidate whose cell count passes the
 * adaptive per-BPM threshold wins; falls back to best-per-BPM.
 */
export function selectMainKeyType(bpmKeyTypes: BPMKeyType[]): BPMKeyType {
  interface BPMGroup { keyType: string; cellCount: number }
  const byBPM = new Map<number, BPMGroup[]>();
  for (const e of bpmKeyTypes) {
    if (LN_TYPES.has(e.keyType)) continue;
    const arr = byBPM.get(e.bpm) ?? [];
    arr.push(e);
    byBPM.set(e.bpm, arr);
  }

  function mergedCount(entries: BPMGroup[], type: string): number {
    let total = 0;
    for (const e of entries) {
      if (e.keyType === type || (MERGE[type] ?? []).includes(e.keyType)) total += e.cellCount;
    }
    return total;
  }

  const mainCandidates: BPMKeyType[] = [];
  for (const [bpm, es] of byBPM) {
    for (const t of ["Full Handstream",
                     "High Handstream", "High Jumpstream", "Full Jumpstream",
                     "Mid Handstream",
                     "Low Handstream",
                     "Mid Jumpstream", "Low Jumpstream",
                     "Single Stream",
                     "Rolls", "Minitrills", "High Stream", "Speedy Tech",
                     "High Chordjack",
                     "Mid Chordjack",
                     "Low Chordjack",
                     "Minijack", "Jacky Tech"]) {
      const cnt = mergedCount(es, t);
      if (cnt > 0) mainCandidates.push({ keyType: t, bpm, cellCount: cnt, percentage: 0 });
    }
  }

  function effBpm(kt: string, raw: number): number {
    return Math.round((JACK_TYPES.has(kt) ? raw * 2 : raw) / 10) * 10;
  }
  mainCandidates.sort((a, b) =>
    effBpm(b.keyType, b.bpm) - effBpm(a.keyType, a.bpm) ||
    (TIER[a.keyType] ?? 9) - (TIER[b.keyType] ?? 9) ||
    b.bpm - a.bpm  // same eff+tier → higher original BPM (not jack×2 boosted) first
  );

  // Per-candidate N: use the DISPLAYED BPM (raw, not jack×2) for threshold.
  // Low-BPM patterns need fewer cells to be meaningful.
  function threshold(kt: string, rawBpm: number): number {
    if (rawBpm < 150) return 30;
    if (!JACK_TYPES.has(kt) && rawBpm < 200) return 30;
    return 50;
  }
  const pass = mainCandidates.find(e => e.cellCount >= threshold(e.keyType, e.bpm));
  if (pass) {
    return pass;
  }
  // Fallback: BPM desc, most cells per BPM (no merge)
  const fbBPM = new Map<number, BPMKeyType>();
  for (const e of bpmKeyTypes) {
    if (LN_TYPES.has(e.keyType)) continue;
    const ex = fbBPM.get(e.bpm);
    if (!ex || e.cellCount > ex.cellCount) fbBPM.set(e.bpm, e);
  }
  const fb = [...fbBPM.values()].sort((a, b) => b.bpm - a.bpm);
  const fbPass = fb.find(e => e.cellCount >= threshold(e.keyType, e.bpm));
  if (fb.length === 0) {
    // All-LN map: no non-LN fallback exists — pick the highest-cellCount key type overall
    return [...bpmKeyTypes].sort((a, b) => b.cellCount - a.cellCount)[0]
      ?? { keyType: "Unknown", bpm: 0, cellCount: 0, percentage: 0 };
  }
  return fbPass ?? fb.reduce((a, b) => a.cellCount >= b.cellCount ? a : b);
}
