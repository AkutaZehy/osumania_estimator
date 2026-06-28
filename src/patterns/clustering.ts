// ============================================================
// Pattern Clustering — beat-grid-aware division-based grouping
// Replaces old MsPerBeat BPM-based clustering with note-division
// detection against the beatmap's primary beat length.
// ============================================================

import { CorePattern, type FoundPattern, type PatternCluster } from "../types/patterns.js";
import type { PrimitiveRow } from "../types/primitives.js";
import { PATTERNS_CONFIG } from "./config.js";
import { resolveRatingMultiplier } from "./patternsDef.js";

// ============================================================
// Valid note divisions
// ============================================================

/** Valid note divisions: 1 (4分), 2 (8分), 3 (12分), 4 (16分), 6 (24分), 8 (32分) */
const VALID_DIVISIONS = [1, 2, 3, 4, 6, 8] as const;

// ============================================================
// Interval merging
// ============================================================

/**
 * Merge overlapping [start, end] intervals and return total non-overlapping time (ms).
 */
function patternAmount(sortedStartsEnds: Array<[number, number]>): number {
  if (!sortedStartsEnds.length) return 0;
  let totalTime = 0;
  let [currentStart, currentEnd] = sortedStartsEnds[0]!;

  for (const [start, end] of sortedStartsEnds) {
    if (currentEnd < end) {
      totalTime += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else {
      currentEnd = Math.max(currentEnd, end);
    }
  }

  totalTime += currentEnd - currentStart;
  return totalTime;
}

// ============================================================
// Division assignment
// ============================================================

// Division bands (asymmetric — wider for 24th/32nd to catch timing variance, BPM 150-300)
const DIVISION_BANDS: Array<[number, number, number]> = [
  [0.75, 1.5, 1],   // 4分度
  [1.5,  2.75, 2],   // 8分度
  [2.75, 3.5, 3],   // 12分度
  [3.5,  4.8, 4],   // 16分度 (standard)
  [4.8,  7.0, 6],   // 24分度
  [7.0,  9.5, 8],   // 32分度
];
const GRACE_THRESHOLD = 9.5;  // 48分度及以上 → grace

/** Assign a raw division estimate to the nearest valid division using band-based lookup. */
function nearestValidDivision(raw: number): number {
  for (const [lo, hi, div] of DIVISION_BANDS) {
    if (raw >= lo && raw < hi) return div!;
  }
  return 4; // fallback
}

/** A FoundPattern assigned a beat-grid division. */
interface ClassifiedPattern {
  /** Original detected pattern */
  source: FoundPattern;
  /** Nearest valid note division (1, 2, 3, 4, 6, 8) */
  division: number;
  /** Specific sub-pattern type for this speed band (computed from rows, not inherited) */
  specificType: string | null;
  start: number;
  end: number;
  mixed: boolean;
}

/**
 * Assign each FoundPattern to its nearest beat-grid division.
 * Patterns faster than division 6 are classified as grace and separated.
 */
function classifyPatterns(
  patterns: FoundPattern[],
  primitives: PrimitiveRow[],
  beatLength: number,
): { classified: ClassifiedPattern[]; grace: ClassifiedPattern[] } {
  const classified: ClassifiedPattern[] = [];
  const grace: ClassifiedPattern[] = [];
  let totalPatterns = 0;
  const divCounts: Record<string, number> = {};

  for (const p of patterns) {
    totalPatterns++;
    // Find primitive rows within the pattern's time range
    const rows = primitives.filter((r) => r.time >= p.start && r.time < p.end);
    if (rows.length === 0) continue;

    // Build histogram of msPerBeat → count
    const speedHistogram = new Map<number, number>();
    for (const row of rows) {
      const divRaw = row.beatLength / (row.msPerBeat / 4);
      const divRounded = nearestValidDivision(divRaw);
      speedHistogram.set(divRounded, (speedHistogram.get(divRounded) ?? 0) + 1);
    }

    // If multiple distinct speeds exist in the same pattern, split into sub-entries
    for (const [divStr, count] of speedHistogram) {
      const div = Number(divStr);
      if (count < 2) continue; // skip single-row noise

      // Narrow time span to only rows matching this speed (not full pattern window)
      const speedRows = rows.filter((r) => {
        const d = r.beatLength / (r.msPerBeat / 4);
        return nearestValidDivision(d) === div;
      });
      const start = speedRows.length > 0 ? speedRows[0]!.time : p.start;
      const end = speedRows.length > 0 ? speedRows[speedRows.length - 1]!.time : p.end;

      // Determine specificType for THIS speed band (not inherited from source pattern)
      let bandSpecific: string | null = p.specificType;
      const hasHand = speedRows.some((r) => r.notes >= 3);
      const hasJump = speedRows.some((r) => r.notes >= 2);
      if (p.pattern === "Chordstream") {
        if (hasHand) bandSpecific = "HandStream";
        else if (hasJump) bandSpecific = "JumpStream";
      } else if (p.pattern === "Jacks") {
        if (hasHand) bandSpecific = "ChordJacks";
        else if (hasJump) bandSpecific = "MiniJacks";
      }

      const item: ClassifiedPattern = {
        source: p,
        division: div,
        specificType: bandSpecific,
        start,
        end,
        mixed: p.mixed,
      };

      // Check grace: original effectiveDivision > GRACE_THRESHOLD
      const rawDelta = p.msPerBeat / 4;
      const effectiveDivision = rawDelta > 0 ? beatLength / rawDelta : 0;
      if (effectiveDivision > GRACE_THRESHOLD) {
        grace.push(item);
      } else {
        classified.push(item);
        const key = `${item.source.pattern}@${item.division}`;
        divCounts[key] = (divCounts[key] ?? 0) + 1;
      }
    }
  }

  return { classified, grace };
}

// ============================================================
// Group builder
// ============================================================

/** Intermediate group keyed by pattern type + division + mixed flag. */
interface ClusterGroup {
  pattern: CorePattern;
  division: number;
  mixed: boolean;
  items: ClassifiedPattern[];
}

function buildGroups(classified: ClassifiedPattern[]): Map<string, ClusterGroup> {
  const groups = new Map<string, ClusterGroup>();

  for (const item of classified) {
    const key = `${item.source.pattern}@@${item.division}@@${item.mixed ? 1 : 0}`;
    if (!groups.has(key)) {
      groups.set(key, {
        pattern: item.source.pattern,
        division: item.division,
        mixed: item.mixed,
        items: [],
      });
    }
    groups.get(key)!.items.push(item);
  }

  return groups;
}

// ============================================================
// Cluster output builder
// ============================================================

/**
 * Build a PatternCluster from a ClusterGroup.
 * Computes amount (non-overlapping time), specific type distribution,
 * rating multiplier, importance, and display BPM / timingMs.
 */
function buildClusterOutput(
  group: ClusterGroup,
  beatLength: number,
  modeTag: string,
): PatternCluster {
  const startsEnds = group.items
    .map((m) => [m.start, m.end] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const dataCount = group.items.length;
  const counter = new Map<string, number>();
  for (const m of group.items) {
    if (m.specificType != null) {
      counter.set(
        m.specificType,
        (counter.get(m.specificType) || 0) + 1,
      );
    }
  }

  const specificTypes: Array<[string, number]> = [...counter.entries()]
    .map(([name, count]) => [name, count / dataCount] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  const dominantSpecific = specificTypes.length
    ? specificTypes[0]![0]
    : null;
  const amount = startsEnds.length
    ? patternAmount(startsEnds)
    : 0;

  const ratingMultiplier = resolveRatingMultiplier(
    group.pattern,
    dominantSpecific,
    modeTag,
  );

  const division = group.division;
  const rawBPM = beatLength > 0 ? 60000 / beatLength : 120;
  const bpm = Math.round(rawBPM * division / 4);
  const timingMs = Math.round(beatLength / division);

  return {
    pattern: group.pattern,
    specificTypes,
    ratingMultiplier,
    division,
    bpm,
    timingMs,
    mixed: group.mixed,
    amount,
    get importance(): number {
      return this.amount * this.ratingMultiplier * this.division;
    },
  };
}

// ============================================================
// Half-speed detection and merging
// ============================================================

/**
 * Find the dominant division across all groups, weighted by
 * total non-overlapping time (amount) per division.
 */
function findDominantDivision(groups: Map<string, ClusterGroup>): number {
  const amountByDivision = new Map<number, number>();

  for (const group of groups.values()) {
    const startsEnds = group.items
      .map((m) => [m.start, m.end] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const amt = patternAmount(startsEnds);
    amountByDivision.set(
      group.division,
      (amountByDivision.get(group.division) || 0) + amt,
    );
  }

  let dominant = 4;
  let maxAmount = 0;
  for (const [div, amt] of amountByDivision) {
    if (amt > maxAmount) {
      maxAmount = amt;
      dominant = div;
    }
  }
  return dominant;
}

/**
 * Merge half-speed clusters into their main-speed counterparts.
 *
 * A half-speed cluster (division = dominant / 2) is merged into a
 * main-speed cluster if:
 *   1. They share the same pattern type and mixed flag
 *   2. Their specific type names overlap (at least one in common)
 *
 * Merged half-speed groups are removed from the map.
 */
function mergeHalfSpeedClusters(
  groups: Map<string, ClusterGroup>,
  dominantDivision: number,
): void {
  const halfDiv = dominantDivision / 2;
  // Only merge if halfDiv is a valid integer division
  if (
    !Number.isInteger(halfDiv) ||
    !(VALID_DIVISIONS as readonly number[]).includes(halfDiv)
  ) {
    return;
  }

  // Index main-speed groups by pattern for fast lookup
  const mainGroups = new Map<string, ClusterGroup[]>();
  for (const group of groups.values()) {
    if (group.division === dominantDivision) {
      const list = mainGroups.get(group.pattern) || [];
      list.push(group);
      mainGroups.set(group.pattern, list);
    }
  }

  const toDelete: string[] = [];

  for (const [key, group] of groups) {
    if (group.division !== halfDiv) continue;

    const candidates = mainGroups.get(group.pattern);
    if (!candidates || !candidates.length) continue;

    // Collect specific type names in the half-speed group
    const halfSpecifics = new Set<string>();
    for (const item of group.items) {
      if (item.specificType != null) {
        halfSpecifics.add(item.specificType);
      }
    }
    if (!halfSpecifics.size) continue;

    // Find a main-speed candidate with overlapping specific types
    for (const mainGroup of candidates) {
      const mainSpecifics = new Set<string>();
      for (const item of mainGroup.items) {
        if (item.specificType != null) {
          mainSpecifics.add(item.specificType);
        }
      }

      const hasOverlap = [...halfSpecifics].some((s) => mainSpecifics.has(s));
      if (hasOverlap) {
        // Merge half-speed items into main-speed group
        mainGroup.items.push(...group.items);
        toDelete.push(key);
        break;
      }
    }
  }

  for (const key of toDelete) {
    groups.delete(key);
  }
}

// ============================================================
// Release multiplier scaling
// ============================================================

/** Scale Release rating multiplier if Density/Wildcard clusters exist. */
function applyReleaseDWScaling(clusters: PatternCluster[]): void {
  const hasDW = clusters.some(
    (c) => c.pattern === CorePattern.Density || c.pattern === CorePattern.Wildcard,
  );
  if (
    hasDW &&
    (PATTERNS_CONFIG.RELEASE_WITH_DW_MULTIPLIER as number) !== 1.0
  ) {
    for (const c of clusters) {
      if (
        c.specificTypes.some(
          ([name, ratio]) => name === "Release" && ratio > 0,
        )
      ) {
        c.ratingMultiplier *= PATTERNS_CONFIG.RELEASE_WITH_DW_MULTIPLIER;
      }
    }
  }
}

// ============================================================
// Public API
// ============================================================

export interface ClusteringOptions {
  /** Beatmap's primary beat length in ms (from first uninherited timing point) */
  beatLength: number;
  /** Mode tag for rating multiplier resolution: "RC", "LN", "HB", or "Mix" */
  modeTag?: string;
}

/**
 * Group detected patterns into division-based clusters and compute
 * importance scores using a beat-grid-aware algorithm.
 *
 * Algorithm:
 *   1. Assign each pattern to the nearest valid note division (1,2,3,4,6)
 *      based on its msPerBeat value relative to the beatmap's beatLength.
 *      Patterns above division 6 (grace bursts) are excluded.
 *   2. Group by (pattern type, division, mixed flag).
 *   3. Compute amount, specific type distribution, rating multiplier,
 *      and importance (Amount × RatingMultiplier × division) per group.
 *   4. Detect half-speed variants: clusters at dominant/2 division are
 *      merged into main-speed clusters if pattern & specific types match.
 *   5. Apply Release-with-DW multiplier scaling if applicable.
 *
 * @param patterns  Output from findPatterns()
 * @param options   beatLength (required) and optional modeTag
 * @returns Array of PatternCluster sorted by importance descending
 */
export function calculateClusteredPatterns(
  patterns: FoundPattern[],
  primitives: PrimitiveRow[],
  options: ClusteringOptions,
): PatternCluster[] {
  const effectiveBeatLength = options.beatLength > 0 ? options.beatLength : 500;
  const modeTag = options.modeTag || "Mix";

  // Phase 1-2: Assign divisions using row-level msPerBeat histogram (not pattern average)
  let { classified } = classifyPatterns(patterns, primitives, effectiveBeatLength);

  // Detect half-time BPM: if dominant division ≥ 6, halve effectiveBeatLength and re-classify
  const divCountMap = new Map<number, number>();
  for (const c of classified) { divCountMap.set(c.division, (divCountMap.get(c.division) ?? 0) + 1); }
  let dominantDiv = 4; let maxCount = 0;
  for (const [d, c] of divCountMap) { if (c > maxCount) { maxCount = c; dominantDiv = d; } }
  if (dominantDiv >= 6) {
    const halved = classifyPatterns(patterns, primitives, effectiveBeatLength / 2);
    classified = halved.classified;
  }

  if (!classified.length) return [];

  // Phase 3a: Build groups
  const groups = buildGroups(classified);

  // Phase 3b: Half-speed detection
  const dominantDivision = findDominantDivision(groups);
  mergeHalfSpeedClusters(groups, dominantDivision);

  // Phase 4: Build final cluster outputs
  const clusters: PatternCluster[] = [];
  for (const group of groups.values()) {
    clusters.push(buildClusterOutput(group, effectiveBeatLength, modeTag));
  }

  // Apply Release-with-DW scaling
  applyReleaseDWScaling(clusters);

  // Sort by importance descending
  clusters.sort((a, b) => b.importance - a.importance);

  return clusters;
}



