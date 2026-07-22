// ============================================================
// Pattern Types — detection, clustering, and summary
// Based on osumania_map_analyser patterns/
// ============================================================

/** Five core pattern categories — LN replaces Coordination/Density/Wildcard */
export const enum CorePattern {
  Stream = "Stream",
  Chord = "Chord",          // ren Coinbase:Chordstream
  Jack = "Jack",             // ren Coinbase:Jacks
  LN = "LN",                 // unified LN category (replaces Coordination + Density + Wildcard)
  Grace = "Grace",           // 48th+ division patterns
}

/** A single detected pattern instance with timing */
export interface FoundPattern {
  pattern: CorePattern;
  specificType: string | null;  // e.g., "Roll", "Trill", "Handstream"
  start: number;                // ms
  end: number;                  // ms
  msPerBeat: number;            // average timing delta
  mixed: boolean;               // true if BPM is unstable in this window
}

/** A cluster of similar patterns grouped by note division (beat-grid-aware) */
export interface PatternCluster {
  pattern: CorePattern;
  specificTypes: Array<[string, number]>;  // [name, ratio]
  ratingMultiplier: number;
  /** Effective note division: 1 (whole), 2 (half/8th), 3 (12th), 4 (quarter/16th), 6 (24th) */
  division: number;
  /** Display BPM = rawBPM × division / 4 */
  bpm: number;
  /** Actual timing interval in ms = beatLength / division */
  timingMs: number;
  mixed: boolean;
  /** Total non-overlapping time span (ms) of all patterns in this cluster */
  amount: number;
  /** Composite score: Amount × RatingMultiplier × division */
  importance: number;
}

/** Full pattern analysis result */
export interface PatternSummary {
  clusters: PatternCluster[];
  /** Top-level chart category (e.g., "Jumpstream", "Handstream Tech") */
  category: string;
  /** Fraction of notes that are LNs */
  lnPercent: number;
  /** Mode tag: "RC", "LN", "HB", or "Mix" */
  modeTag: "RC" | "LN" | "HB" | "Mix";
  /** Total time (ms) at non-1.0 SV */
  svAmount: number;
  /** Total chart duration (ms) */
  duration: number;
  /** Clusters filtered by importance >= 50% of top cluster */
  importantClusters: PatternCluster[];
  /** Per-cluster LN annotations (RC/Mix mode: attached to Stream/Chord/Jack clusters) */
  lnAnnotations?: {
    shieldCount: number;
    reversedShieldCount: number;
    columnLockCount: number;
    overlapCount: number;
    inverseCount: number;
    ouroborosCount: number;
    lnStreamCount: number;
    lnChordCount: number;
    wcJackCount: number;
    wcSpeedCount: number;
  };
  /** Raw LN pattern counts (set by summary, used by lnAnalysis) */
  _lnCounts?: {
    shields: number;
    reversedShields: number;
    columnLocks: number;
    inverses: number;
    ouroboros: number;
    overlaps: number;
    lnStreams: number;
    lnChords: number;
    wcJacks: number;
    wcSpeeds: number;
    /** @deprecated — replaced by overlaps */
    releases?: number;
  };
}
