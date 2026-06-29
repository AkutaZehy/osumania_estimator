// ============================================================
// Custom Types — user-designed difficulty metrics
// ============================================================

/** Raw density metrics at multiple window sizes */
export interface DensityMetrics {
  /** Per-column density (max & median), window size in ms */
  perColumn: Array<{
    column: number;
    maxDensity: number;
    medianDensity: number;
  }>;
  /** Per-hand density (left = cols 0-1, right = cols 2-3) */
  perHand: {
    left: { maxDensity: number; medianDensity: number };
    right: { maxDensity: number; medianDensity: number };
  };
  /** Both-hands aggregate density */
  bothHands: { maxDensity: number; medianDensity: number };
}

/** Equivalent BPM — adjusted for dominant note division */
export interface EquivalentBPM {
  /** Raw BPM from timing points */
  rawBPM: number;
  /** Adjusted BPM after accounting for dominant note division */
  adjustedBPM: number;
  /** Detected dominant note division (e.g., 1/2, 1/4, 1/8) */
  dominantDivision: number;
  /** Pattern type used for adjustment (e.g., "Jack", "Stream", "Stamina") */
  patternType: string;
}

/** Jack-specific analysis */
export interface JackMetrics {
  /** Density grade: "Mini" | "Low" | "Mid" | "Dense" | null */
  densityGrade: string | null;
  /** Number of anchor patterns detected (3+ consecutive same column) */
  anchorCount: number;
  /** Single-finger pressure score (0-1) */
  singleFingerPressure: number;
  /** Single-hand pressure score (0-1) */
  singleHandPressure: number;
  /** Multi-scale imbalance: "4r/16r/total" or "bias" if only one side has notes */
  imbalance4r: number;
  imbalance16r: number;
  imbalanceTotal: number;
  /** True if only one hand has jack notes */
  isBias: boolean;
  /** Vibro detection flag */
  isVibro: boolean;
}

/** Stream-specific analysis */
export interface StreamMetrics {
  /** Classification: "JS" | "HS" | "Stream" | null */
  streamType: "JumpStream" | "HandStream" | "JumpStream / HandStream" | "Stream" | null;
  /** Density grade for 4-row average */
  densityGrade: string | null;
  /** Multi-scale imbalance */
  imbalance4r: number;
  imbalance16r: number;
  imbalanceTotal: number;
  /** Broken stream: "max/med" density in 2-row windows at cluster speed */
  brokenMax: number;
  brokenMed: number;
}

/** Roll/Trill statistics */
export interface RollTrillStats {
  /** e.g. "24×16 16×4" */
  rolls: string;
  /** e.g. "24×8 16×12" */
  trills: string;
}

/** Tech-specific analysis */
export interface TechMetrics {
  graceCount: number;
  rollTrill: RollTrillStats;
  burst: {
    singleFingerMaxKPS: number;
    oneHandMaxKPS: number;
    bothHandsMaxKPS: number;
  };
}

/** Stamina-specific analysis */
export interface StaminaMetrics {
  /** Max-density 4-row value */
  maxDensity: number;
  /** Longest stretch (ms) at max density */
  maxDuration: number;
  /** Med-density 4-row value */
  medDensity: number;
  /** Longest stretch (ms) at med density */
  medDuration: number;
  /** Total time (ms) above med density */
  medTotalTime: number;
  /** Percentage of map above med density */
  stretchRatio: number;
  /** Max jack↔stream transitions in any 16-row window */
  switchFrequency: number;
}

/** Long Note analysis */
export interface LNMetrics {
  /** LN ratio */
  ratio: number;
  /** LN ratio excluding tap LNs (treated as rice) */
  strictLNRatio: number;
  /** Release difficulty (adapted from Sunny Rbar) */
  releaseDifficulty: number;
  /** Shield patterns detected (normal→LN head) */
  shieldCount: number;
  /** Anti-Shield patterns detected (LN tail→normal) */
  antiShieldCount: number;
  /** Column lock patterns detected */
  columnLockCount: number;
  /** Inverse patterns detected (alternating LN releases) */
  inverseCount: number;
  /** A: different head col, same tail time pairs */
  asyncReleaseCount: number;
  /** R: same head col, different tail time pairs */
  releaseCount: number;
  /** Tap LN count: short LNs <= 16th note duration */
  tapLNCount: number;
  /** Total LN count (for overlay percentage) */
  totalLN: number;
}

/** Complete custom metrics result */
export interface CustomMetrics {
  density: DensityMetrics;
  equivalentBPM: EquivalentBPM;
  jack: JackMetrics;
  stream: StreamMetrics;
  tech: TechMetrics;
  stamina: StaminaMetrics;
  ln: LNMetrics;
}
