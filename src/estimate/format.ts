// ============================================================
// estimate/format.ts — dan value formatting (Reform naming)
// ============================================================

import type { EstimateResult } from "./akuta.js";

// Greek naming above 10 dan, following the benchmark reference naming:
// 11 Alpha, 12 Beta, ..., 20 kappa, beyond that plain numbers.
const GREEK_BASE: Record<number, string> = {
  11: "Alpha", 12: "Beta", 13: "Gamma", 14: "Delta", 15: "Epsilon",
  16: "Zeta", 17: "Eta", 18: "Theta", 19: "iota", 20: "kappa",
};

/**
 * Format one estimate as "N dan tier (value)".
 * RC follows the Reform system: .1/.2/.3 dan (Reform 1-3 Intro,
 * difficulty 3 < 2 < 1) up to eta (17) render with the "RC Reform"
 * prefix; above eta no Reform prefix. Greek names from Alpha (11).
 * LN keeps plain digits and shows "below ln 1" under 1 dan.
 */
export function formatDanValue(v: number | null, isLN: boolean): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (isLN) {
    if (v < 1) return `LN below ln 1 (${v.toFixed(2)})`;
    const base = Math.round(v);
    const frac = v - base;
    const tier = frac <= -0.125 ? "low" : frac <= 0.125 ? "mid" : "high";
    return `LN ${base} dan ${tier} (${v.toFixed(2)})`;
  }

  // RC: Reform system, lowest dan is .1 (Reform 1 Intro)
  if (v < 1) {
    const b = Math.round(v);
    if (b <= -3) return "RC below .1 Dan";
    if (b <= 0) {
      const name = b === -2 ? ".1" : b === -1 ? ".2" : ".3";
      const frac = v - b;
      const tier = frac <= -0.125 ? "low" : frac <= 0.125 ? "mid" : "high";
      return `RC Reform ${name} dan ${tier} (${v.toFixed(2)})`;
    }
  }

  const base = Math.round(v);
  const frac = v - base;
  const tier = frac <= -0.125 ? "low" : frac <= 0.125 ? "mid" : "high";
  const name = base >= 11 ? (GREEK_BASE[base] ?? String(base)) : String(base);
  const prefix = base <= 17 ? "RC Reform" : "RC";
  return `${prefix} ${name} dan ${tier} (${v.toFixed(2)})`;
}

/** Full line for the overlay: "RC ..." and, for LN charts, ", LN ..." */
export function formatAkuta(est: EstimateResult): string {
  const parts: string[] = [];
  if (est.rc != null) parts.push(formatDanValue(est.rc, false));
  if (est.ln != null) parts.push(formatDanValue(est.ln, true));
  return parts.join(", ") || "—";
}
