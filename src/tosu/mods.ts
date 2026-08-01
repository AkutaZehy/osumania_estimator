// ============================================================
// mods.ts — parse mod data from tosu v2 payloads
// Extracted from index.ts and hardened:
//  - correct bit flags (no Flashlight misread as HT)
//  - prefer tosu `rate` field, then lazer speed_change, then codes
//  - IN/HO conversion-flag detection (lazer)
//  - partial-packet detection (hasModInfo / hasExplicitNoMod)
// ============================================================

export interface ModData {
  /** tosu client kind: "stable" | "lazer" (from payload, may be "") */
  client: string;
  /** Playback speed multiplier (1.0 nomod, 1.5 DT, 0.75 HT) */
  speedRate: number;
  /** OD-affecting mod: "HR" | "EZ" | null */
  odFlag: string | null;
  /** Chart-conversion mod: "IN" | "HO" | null (IN takes precedence) */
  cvtFlag: string | null;
  /** Calculation-relevant signature — change ⇒ re-analyze */
  modSignature: string;
  /** Whether any mods payload was present in the packet */
  hasModPayload: boolean;
  /** Whether the payload carried real mod info (vs. empty/default) */
  hasModInfo: boolean;
  /** Whether the payload explicitly said "no mods" */
  hasExplicitNoMod: boolean;
}

/** Known mod acronyms, longest-first so the greedy scanner works. */
const KNOWN_MOD_CODES = [
  "SV2", "NOMOD",
  "1K", "2K", "3K", "4K", "5K", "6K", "7K", "8K", "9K", "10K",
  "NF", "EZ", "TD", "HD", "HR", "SD", "DT", "RX", "HT", "NC", "FL",
  "AT", "SO", "AP", "PF", "FI", "RD", "CN", "TG", "MR", "v2",
  "DC", "BL", "ST", "AC", "TP", "DA", "CL", "AL", "SG", "TR", "WG",
  "SI", "GR", "DF", "WU", "WD", "TC", "BR", "AD", "MU", "NS", "MG",
  "RP", "AS", "FR", "BU", "SY", "DP", "HO", "CS", "IN", "DS", "CO",
  "NR", "FF", "SW", "SR", "MF",
].sort((a, b) => b.length - a.length);

/** Legacy stable mod bitfield entries (only ones that affect difficulty). */
const MOD_BIT_FLAG_ENTRIES: Array<[string, number]> = [
  ["NF", 1 << 0],
  ["EZ", 1 << 1],
  ["HD", 1 << 3],
  ["HR", 1 << 4],
  ["SD", 1 << 5],
  ["DT", 1 << 6],
  ["HT", 1 << 8],
  ["NC", 1 << 9],
  ["FL", 1 << 10],
  ["PF", 1 << 14],
];

function collectValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(Boolean);
  }
  return [];
}

/** Extract individual mod codes from a combined string like "DTNC" / "HDHRDT". */
function addCodesFromString(
  codes: Set<string>,
  value: unknown,
  known: string[],
): void {
  if (typeof value !== "string" || value.trim().length === 0) return;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let index = 0;
  while (index < normalized.length) {
    let matched = false;
    for (const code of known) {
      if (normalized.startsWith(code, index)) {
        codes.add(code);
        index += code.length;
        matched = true;
        break;
      }
    }
    if (!matched) index += 1;
  }
}

function addCodesFromNumber(
  codes: Set<string>,
  value: unknown,
  entries: Array<[string, number]>,
): void {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  for (const [code, bit] of entries) {
    if ((n & bit) !== 0) codes.add(code);
  }
}

export function parseModsFromData(
  data: Record<string, unknown> | undefined,
): ModData {
  const client = String(data?.client ?? "").toLowerCase();

  // Collect mods from all possible locations (play, menu, resultsScreen, tourney)
  const candidates: unknown[] = [];
  const play = data?.play as Record<string, unknown> | undefined;
  const menu = data?.menu as Record<string, unknown> | undefined;
  const results = data?.resultsScreen as Record<string, unknown> | undefined;

  if (play?.mods != null) candidates.push(play.mods);
  if (menu?.mods != null) candidates.push(menu.mods);
  if (results?.mods != null) candidates.push(results.mods);

  const tourney = data?.tourney as Record<string, unknown> | undefined;
  if (tourney) {
    for (const v of collectValues(tourney.clients)) {
      const c = v as Record<string, unknown>;
      const playObj = c.play as Record<string, unknown> | undefined;
      if (playObj?.mods != null) candidates.push(playObj.mods);
    }
  }

  const codes = new Set<string>();
  const modArrays: unknown[][] = [];
  let hasModPayload = false;
  let hasExplicitNoMod = false;
  let rate: number | undefined;

  for (const mods of candidates) {
    const m = mods as Record<string, unknown>;
    hasModPayload = true;

    const nameText = typeof m.name === "string" ? m.name.trim() : "";
    const strText = typeof m.str === "string" ? m.str.trim() : "";
    const acronymText = typeof m.acronym === "string" ? m.acronym.trim() : "";
    const numberValue = Number(m.number);
    const numValue = Number(m.num);

    if (
      /^(NM|NOMOD|NONE)$/i.test(nameText) ||
      /^(NM|NOMOD|NONE)$/i.test(strText) ||
      /^(NM|NOMOD|NONE)$/i.test(acronymText) ||
      (Number.isFinite(numberValue) && numberValue === 0) ||
      (Number.isFinite(numValue) && numValue === 0)
    ) {
      hasExplicitNoMod = true;
    }

    addCodesFromString(codes, m.name, KNOWN_MOD_CODES);
    addCodesFromString(codes, m.str, KNOWN_MOD_CODES);
    addCodesFromString(codes, m.acronym, KNOWN_MOD_CODES);
    addCodesFromNumber(codes, m.number, MOD_BIT_FLAG_ENTRIES);
    addCodesFromNumber(codes, m.num, MOD_BIT_FLAG_ENTRIES);

    // tosu provides the exact clock rate — prefer it when present.
    const r = Number(m.rate);
    if (rate === undefined && Number.isFinite(r) && r > 0) rate = r;

    if (Array.isArray(m.array)) {
      if (m.array.length === 0) hasExplicitNoMod = true;
      modArrays.push(m.array as unknown[]);
    }
    if (Array.isArray(mods)) {
      if (mods.length === 0) hasExplicitNoMod = true;
      modArrays.push(mods as unknown[]);
    }
  }

  let lazerSpeedChange: number | undefined;
  for (const arr of modArrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") {
        if (typeof item === "string") {
          addCodesFromString(codes, item, KNOWN_MOD_CODES);
        }
        continue;
      }
      const im = item as Record<string, unknown>;
      const acr = String(im.acronym ?? "").toUpperCase();
      if (acr) codes.add(acr);
      const sc = Number((im.settings as Record<string, unknown> | undefined)?.speed_change);
      if (Number.isFinite(sc) && sc > 0) lazerSpeedChange = sc;
    }
  }

  // speedRate: rate field > lazer speed_change > code heuristics
  let speedRate = 1.0;
  if (rate !== undefined) speedRate = rate;
  else if (lazerSpeedChange !== undefined) speedRate = lazerSpeedChange;
  else if (codes.has("NC") || codes.has("DT")) speedRate = 1.5;
  else if (codes.has("HT") || codes.has("DC")) speedRate = 0.75;

  // OD flag
  let odFlag: string | null = null;
  if (codes.has("HR")) odFlag = "HR";
  else if (codes.has("EZ")) odFlag = "EZ";

  // Conversion flag (IN takes precedence over HO, matching reference)
  let cvtFlag: string | null = null;
  if (codes.has("IN")) cvtFlag = "IN";
  else if (codes.has("HO")) cvtFlag = "HO";

  const hasModInfo =
    codes.size > 0 ||
    lazerSpeedChange !== undefined ||
    cvtFlag !== null ||
    odFlag !== null ||
    Math.abs(speedRate - 1.0) > 1e-6;

  // Calculation-relevant signature — change triggers re-analysis.
  const modSignature = `${speedRate.toFixed(5)}|${odFlag ?? "none"}|${cvtFlag ?? "none"}`;

  return {
    client,
    speedRate,
    odFlag,
    cvtFlag,
    modSignature,
    hasModPayload,
    hasModInfo,
    hasExplicitNoMod,
  };
}
