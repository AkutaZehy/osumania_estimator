// ============================================================
// Beatmap Types — parsed .osu file data structures
// Ported and adapted from Star-Rating-Rebirth osu_file_parser.py
// and osumania_map_analyser osuFileParser.js
// ============================================================

/** Raw metadata extracted from the beatmap */
export interface BeatmapMetadata {
  title: string;
  artist: string;
  creator: string;
  version: string;
  beatmapId: number;
  setId: number;
}

/** A single timing point (uninherited = red line, inherited = green line) */
export interface TimingPoint {
  time: number;       // ms
  beatLength: number;  // ms per beat; negative for inherited points
  meter: number;       // beats per measure (uninherited only)
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  uninherited: boolean;
  effects: number;
}

/** A break period (no notes) */
export interface BreakPeriod {
  startTime: number;  // ms
  endTime: number;    // ms
}

/**
 * A single hit object parsed from the .osu file.
 * 
 * For normal notes: endTime is irrelevant (same as startTime or ignored).
 * For long notes (LN): endTime is the hold end, type has bit 128 set.
 */
export interface HitNote {
  column: number;      // 0-indexed column (derived from x-position)
  startTime: number;   // ms
  endTime: number;     // ms (for LNs: hold end time)
  type: number;        // raw type bitfield (bit 128 = LN)
}

/** LN detection: note type & 128 !== 0 */
export const NOTE_TYPE_LN = 128;

/** Full parsed beatmap result from OsuFileParser */
export interface ParsedBeatmap {
  columnCount: number;   // number of keys (4 for 4K)
  columns: number[];     // per-note column assignments
  noteStarts: number[];  // per-note start times (ms)
  noteEnds: number[];    // per-note end times (ms)
  noteTypes: number[];   // per-note type bitfields
  od: number;            // Overall Difficulty (0-10+)
  metadata: BeatmapMetadata;
  timingPoints: TimingPoint[];
  breaks: BreakPeriod[];
  lnRatio: number;       // fraction of notes that are LNs (0-1)
  gameMode: number;      // 3 = mania
  firstNote: number;     // ms
  lastNote: number;      // ms
  duration: number;      // ms (lastNote - firstNote)
}
