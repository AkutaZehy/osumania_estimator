// ============================================================
// Pattern Finder — sliding window engine
// Ported from osumania_map_analyser js/patterns/findPatterns.js
// ============================================================

import { CorePattern, type FoundPattern } from "../types/patterns.js";
import type { PrimitiveRow } from "../types/primitives.js";
import { PATTERNS_CONFIG } from "./config.js";
import {
  CORE_CHORDSTREAM,
  CORE_JACKS,
  CORE_LN,
  CORE_STREAM,
  SPECIFIC_4K,
  SPECIFIC_7K,
  SPECIFIC_OTHER,
  type SpecificEntry,
} from "./patternsDef.js";

// ============================================================
// Specific pattern selection
// ============================================================

function pickSpecificFirst(
  specificList: SpecificEntry[],
  remaining: PrimitiveRow[],
): [number, string] | null {
  for (const [name, p] of specificList) {
    const n = p(remaining);
    if (n !== 0) return [n, name];
  }
  return null;
}

function pickSpecificAll(
  specificList: SpecificEntry[],
  remaining: PrimitiveRow[],
): Array<[number, string]> {
  const matched: Array<[number, string]> = [];
  for (const [name, p] of specificList) {
    const n = p(remaining);
    if (n !== 0) matched.push([n, name]);
  }
  return matched;
}

// ============================================================
// Result builders
// ============================================================

function resolvedMspb(
  pattern: CorePattern,
  specificType: string | null,
  meanMspb: number,
): number {
  if (pattern === CorePattern.LN && specificType === "Inverse") {
    return 0.0;
  }
  return meanMspb;
}

function appendFoundPattern(
  results: FoundPattern[],
  pattern: CorePattern,
  specificType: string | null,
  n2: number,
  remaining: PrimitiveRow[],
  lastNote: number,
): void {
  const d = remaining.slice(0, n2);
  const meanMspb =
    d.reduce((sum, x) => sum + x.msPerBeat, 0) / d.length;
  const mixed = !d.every(
    (x) =>
      Math.abs(x.msPerBeat - meanMspb) <
      PATTERNS_CONFIG.PATTERN_STABILITY_THRESHOLD,
  );

  const start = remaining[0]!.time;
  let end: number;

  if (pattern === CorePattern.Jack) {
    const endCandidate =
      n2 < remaining.length ? remaining[n2]!.time : lastNote;
    end = Math.max(
      remaining[0]!.time + remaining[0]!.msPerBeat * 0.5,
      endCandidate,
    );
  } else {
    end = n2 < remaining.length ? remaining[n2]!.time : lastNote;
  }

  results.push({
    pattern,
    specificType,
    mixed,
    start,
    end,
    msPerBeat: resolvedMspb(pattern, specificType, meanMspb),
  });
}

// ============================================================
// Core matching
// ============================================================

interface SpecificPatternMap {
  Stream: SpecificEntry[];
  Chord: SpecificEntry[];
  Jack: SpecificEntry[];
  LN: SpecificEntry[];
}

function appendCoreMatches(
  results: FoundPattern[],
  pattern: CorePattern,
  coreN: number,
  specificList: SpecificEntry[],
  remaining: PrimitiveRow[],
  lastNote: number,
): void {
  if (coreN === 0) return;

  if (PATTERNS_CONFIG.ENABLE_MULTI_LABEL_SAME_WINDOW) {
    const matched = pickSpecificAll(specificList, remaining);
    if (!matched.length) {
      appendFoundPattern(
        results,
        pattern,
        null,
        coreN,
        remaining,
        lastNote,
      );
      return;
    }

    for (const [m, specificType] of matched) {
      appendFoundPattern(
        results,
        pattern,
        specificType,
        Math.max(coreN, m),
        remaining,
        lastNote,
      );
    }
    return;
  }

  const picked = pickSpecificFirst(specificList, remaining);
  if (picked == null) {
    appendFoundPattern(results, pattern, null, coreN, remaining, lastNote);
    return;
  }

  const [m, specificType] = picked;
  appendFoundPattern(
    results,
    pattern,
    specificType,
    Math.max(coreN, m),
    remaining,
    lastNote,
  );
}

// ============================================================
// Sliding window matches
// ============================================================

function matches(
  specificMap: SpecificPatternMap,
  lastNote: number,
  primitives: PrimitiveRow[],
): FoundPattern[] {
  let remaining = [...primitives];
  const results: FoundPattern[] = [];

  while (remaining.length > 0) {
    appendCoreMatches(
      results,
      CorePattern.Stream,
      CORE_STREAM(remaining),
      specificMap.Stream,
      remaining,
      lastNote,
    );
    appendCoreMatches(
      results,
      CorePattern.Chord,
      CORE_CHORDSTREAM(remaining),
      specificMap.Chord,
      remaining,
      lastNote,
    );
    appendCoreMatches(
      results,
      CorePattern.Jack,
      CORE_JACKS(remaining),
      specificMap.Jack,
      remaining,
      lastNote,
    );
    appendCoreMatches(
      results,
      CorePattern.LN,
      CORE_LN(remaining),
      specificMap.LN,
      remaining,
      lastNote,
    );

    remaining = remaining.slice(1);
  }

  return results;
}

// ============================================================
// Public API
// ============================================================

/**
 * Find all patterns in the given primitive rows using sliding window scanning.
 *
 * At each position, tests all 5 core detectors (Stream, Chord, Jack, LN, Grace).
 * also tests the relevant specific sub-patterns. Supports multi-label
 * same-window matching via ENABLE_MULTI_LABEL_SAME_WINDOW config.
 *
 * @param patternRows  Pre-computed primitive rows from calculatePrimitives()
 * @returns Array of FoundPattern with Start/End times and MsPerBeat values
 */
export function find(patternRows: PrimitiveRow[]): FoundPattern[] {
  if (!patternRows.length) return [];

  const keys = patternRows[0]!.keys;
  const lastNote = patternRows[patternRows.length - 1]!.time;

  let keymodePatterns: SpecificPatternMap;

  if (keys === 4) {
    keymodePatterns = SPECIFIC_4K();
  } else if (keys === 7) {
    keymodePatterns = SPECIFIC_7K();
  } else {
    keymodePatterns = SPECIFIC_OTHER();
  }

  return matches(keymodePatterns, lastNote, patternRows);
}
