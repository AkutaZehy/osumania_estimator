// ============================================================
// Grid Analysis — shared types
// ============================================================

export type CellCategory = "jack" | "stream" | "ln" | "break";

export interface NoteInfo {
  col: number;
  start: number;
  end: number;
  isLN: boolean;
}

export interface CellResult {
  /** 0-based beat index */
  beatIndex: number;
  startTime: number;
  endTime: number;
  category: CellCategory;
  /** Detected subdivision denominator (2,3,4,6,8,12), null for LN/break */
  subdivision: number | null;
  /** True when detectSubdivision returned null (no standard subdivision found) */
  isGrace?: boolean;
  /** rawBPM × (subdivision / 4) */
  effectiveBPM: number;
  noteCount: number;
  lnRatio: number;
  /** Per-beat note counts within this cell (4 beats per cell) */
  beatNotes: number[];
  /** Pre-cached notes within this cell (set during Phase 1) */
  _notes: NoteInfo[];
  /** Notes grouped by quarter-beat row (4 rows, set during Phase 1) */
  _rowNotes: NoteInfo[][];
}

export interface SegmentResult {
  cells: CellResult[];
  category: CellCategory;
  effectiveBPM: number;
  subdivision: number;
  startTime: number;
  endTime: number;
  startBeat: number;
  endBeat: number;
  /** 4×4 grid: total notes across all 16 cells */
  gridTotalNotes: number;
  /** avg notes per row = gridTotalNotes / 4 */
  avgPerRow: number;
  /** max notes in any single row */
  maxBeat: number;
  /** Jack/stream grade string */
  grade: string;
  /** Final key type classification */
  keyType: string;
  /** 4 row totals from the grid (per-time-row note counts) */
  rowNotes: number[];
  /** Jack density: N→N+1 adjacent position column sharing rate (0-1) */
  jackDensity: number;
  /** For LN: triggered subtypes */
  lnSubtype: string | null;
  lnSubtypes: Array<{ key: string; name: string; value: string }>;
}

export interface BPMKeyType {
  keyType: string;
  bpm: number;
  cellCount: number;
  percentage: number;
}

export interface GridAnalysisResult {
  cells: CellResult[];
  segments: SegmentResult[];
  bpmKeyTypes: BPMKeyType[];
  mainKeyType: BPMKeyType;
  bpmRange: { min: number; max: number };
  /** Per-run per-cell key type breakdown for display (e.g. "SS 34% + Low JS 33%") */
  streamBreakdown: string;
  /** Grid-based switch: max lenient jack↔stream run transitions in a 16-cell (64-row) window */
  gridSwitch: number;
  /** Descriptor for gridSwitch: Steady / Mixed / Rhythmic / Intense */
  gridSwitchLabel: string;
  /** Vibro classification label */
  vibroLabel: string;
}
