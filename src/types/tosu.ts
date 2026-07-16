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
    mods?: number;
    [key: string]: unknown;
  };
  menu?: {
    gameMode?: number;
    state?: number;
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
