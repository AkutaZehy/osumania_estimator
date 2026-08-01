// ============================================================
// Tosu Types — WebSocket integration with tosu runtime
// Matches tosu API v2 message format
// ============================================================

/** Game state message from tosu WebSocket v2 */
export interface TosuStateMessage {
  state?: {
    name: string;       // "SongSelect", "Playing", "Results", etc.
    number?: number;
  };
  beatmap?: {
    id?: number;
    set?: number;
    md5?: string;
    checksum?: string;
    artist?: string;
    title?: string;
    version?: string;
    mapper?: string;
    time?: {
      live?: number;
      firstObject?: number;
      lastObject?: number;
      mp3Length?: number;
    };
    [key: string]: unknown;
  };
  play?: {
    gameMode?: number;
    playerName?: string;
    score?: number;
    accuracy?: number;
    combo?: { current: number; max: number };
    hits?: Record<string, number>;
    time?: number;
    mods?: TosuMods;
    [key: string]: unknown;
  };
  menu?: {
    gameMode?: number;
    state?: number;
    mods?: TosuMods;
    [key: string]: unknown;
  };
  files?: {
    beatmap?: string;
    [key: string]: unknown;
  };
  directPath?: {
    beatmapFile?: string;
    [key: string]: unknown;
  };
}

/** Tosu v2 mods object: { checksum, number, name, array, rate } */
export interface TosuMods {
  checksum?: string;
  /** Stable-style bitfield */
  number?: number;
  /** Combined acronym string, e.g. "DTNC" (stable) */
  name?: string;
  /** Lazer mod list; each item has acronym + settings */
  array?: Array<TosuModItem | string>;
  /** Exact clock rate, e.g. 1.5 (DT) / 0.75 (HT) — most reliable field */
  rate?: number;
  [key: string]: unknown;
}

export interface TosuModItem {
  acronym?: string;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}
