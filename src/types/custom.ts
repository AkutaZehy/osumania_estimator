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
    meanDensity: number;
  }>;
  /** Per-hand density (left = cols 0-1, right = cols 2-3) */
  perHand: {
  left: { maxDensity: number; medianDensity: number; meanDensity: number };
  right: { maxDensity: number; medianDensity: number; meanDensity: number };
  };
  bothHands: { maxDensity: number; medianDensity: number; meanDensity: number };
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
  /** Hand bias direction: L (left-dominant), R (right-dominant), S (switching), "" (balanced) */
  handBias: "L" | "R" | "S" | "";
  /** Vibro detection flag */
  isVibro: boolean;
}

/** Jack class + stamina, run-extraction based (jackClass.ts) */
export interface JackClassInfo {
  /** Full class label, e.g. "90 Low Chordjack" or "Actually Not Jack" */
  className: string;
  /** Jack cadence effective BPM (dominant qualifying cluster, mod-scaled) */
  eff: number;
  /** False when almost no compliant jack sections exist */
  isJack: boolean;
  /** Burst: longest single streak — seconds + notes inside it */
  burstSec: number;
  burstNotes: number;
  /** True when burst <10s was merged from ≤1-measure-gap streaks past 10s */
  burstBroken: boolean;
  /** Sum over all streaks (unique rows) — seconds + total notes */
  sumSec: number;
  sumNotes: number;
}

/** Stream Stamina peaks + 切 class label (streamClass.ts) */
export interface StreamClassInfo {
  /** e.g. "175 Mid JS, Technical"; "—" when no data */
  className: string;
  /** Dominant row cadence effective BPM */
  eff: number;
  /** Max notes in any 10s sliding window */
  w10: number;
  /** Max notes in any 30s sliding window */
  w30: number;
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
  /** Hand bias direction: L (left-dominant), R (right-dominant), S (switching), "" (balanced) */
  handBias: "L" | "R" | "S" | "";
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
  /** Row-spacing CV within active sections (intervals <= 1s).
   *  0.2-0.4 = steady spacing (streams, chordjack), 0.6+ = bursty tech */
  dtCV: number;
  burst: {
singleFingerInterval: number;
  oneHandInterval: number;
  bothHandsInterval: number;
  singleFingerKPS: number;
  oneHandKPS: number;
  bothHandsKPS: number;
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
  /** Reversed-Shield patterns detected (LN tail→normal) */
  antiShieldCount: number;
  reversedShieldCount: number;
  /** Column lock patterns detected */
  columnLockCount: number;
  /** Inverse patterns detected (alternating LN releases) */
  inverseCount: number;
  ouroborosCount: number;
  /** A: different head col, same tail time pairs */
  asyncReleaseCount: number;
  /** R: same head col, different tail time pairs */
  releaseCount: number;
  /** Tap LN count: short LNs <= 16th note duration */
  tapLNCount: number;
  /** Total LN count (for overlay percentage) */
  totalLN: number;
  /** Overlapping LN pair count */
  overlayCount: number;
  overlapCount: number;
  lnStreamCount: number;
  lnChordCount: number;
  wcJackCount: number;
  wcSpeedCount: number;
  /** LN Pool scores (CO/DE/WC/TE) */
  coordinationPoolScore: number;
  densityPoolScore: number;
  wildcardPoolScore: number;
  technicalPoolScore: number;
}

/** Single tier of anchor/stamina analysis */
export interface AnchorTier {
  p100: number;       // P100 value (in measures)
  p90: number;        // P90 value (in measures)
  p50: number;        // P50 value (in measures)
  p90Count: number;   // # of segments reaching P90
  p50Count: number;   // # of segments reaching P50
}

/** Anchor analysis: single-finger (SF), single-hand (SH), dual-hand (DH) */
export interface AnchorMetrics {
  sf: AnchorTier;
  sh: AnchorTier;
  dh: AnchorTier;
  isJackType: boolean;
  sfBPM: number;
  shBPM: number;
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
  anchor: AnchorMetrics;
  /** Jack type class + burst/sum stamina */
  jackClass: JackClassInfo;
  /** 切 class label + stream stamina peaks */
  streamClass: StreamClassInfo;
}
