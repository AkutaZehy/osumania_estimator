// ============================================================
// Grid Analysis — LN cell metrics & subtype classification
// ============================================================

import { lowerBound } from "../../utils/beatmapUtils.js";
import type { NoteInfo } from "./types.js";
import { buildEdges, computeStrictOuroboros } from "./ouroboros.js";

export interface LNMetrics {
  inverse: number;
  overlay: number;
  ar: number;
  tapLN: number;
  ouroboros: number;
  tree: number;
  shield: number;
  reversedShield: number;
  columnLock: number;
  jsDensity: number;
  hsDensity: number;
  speedyWC: number;
  jackyWC: number;
}

const LN_WIN = 83; // LN_TIME_WINDOW_MS

export function analyzeLNCell(notes: NoteInfo[], beatLength: number): LNMetrics {
  const lns = notes.filter((n) => n.isLN);
  const normals = notes.filter((n) => !n.isLN);
  const ZERO = { inverse: 0, overlay: 0, ar: 0, tapLN: 0, ouroboros: 0, tree: 0, shield: 0, reversedShield: 0, columnLock: 0, jsDensity: 0, hsDensity: 0, speedyWC: 0, jackyWC: 0 };
  if (lns.length === 0) return ZERO;

  // Tap LN: ≤ beatLength/4
  const maxTap = beatLength / 4;
  const tapCount = lns.filter((ln) => ln.end - ln.start <= maxTap).length;
  const tapLN = (tapCount / lns.length) * 100;

  // Inverse: ≥2 columns with ≥2 LN bodies — a coarse cell-level count.
  // sectionAnalysis derives "LN Inverse" from strict head-tail alternation
  // instead; the label is shared but the granularity is intentionally
  // different (cell-level texture vs per-segment strict pattern).
  const colBodies = new Map<number, number>();
  for (const ln of lns) colBodies.set(ln.col, (colBodies.get(ln.col) ?? 0) + 1);
  const invCols = [...colBodies.values()].filter((v) => v >= 2).length;
  const inverse = (invCols / lns.length) * 100;

  // Overlay: strict forward overlap (a.start < b.start && a.end > b.start) — O(k log k)
  let overlayCount = 0;
  if (lns.length >= 2) {
    const sorted = [...lns].sort((a, b) => a.start - b.start);
    const starts = sorted.map(l => l.start);
    // nextDistinct[i]: first index whose start is strictly greater than sorted[i].start
    // (excludes same-start chords, which are not overlays)
    const nextDistinct = new Array<number>(sorted.length);
    let k = sorted.length;
    for (let i = sorted.length - 1; i >= 0; i--) {
      nextDistinct[i] = k;
      if (i === 0 || starts[i - 1] !== starts[i]) k = i;
    }
    for (let i = 0; i < sorted.length; i++) {
      const hi = lowerBound(starts, sorted[i]!.end);
      overlayCount += Math.max(0, hi - nextDistinct[i]!);
    }
  }
  const overlay = (overlayCount / lns.length) * 100;

  // A/R — O(k) via end-time grouping
  let arCount = 0;
  if (lns.length >= 2) {
    const byEnd = new Map<number, typeof lns>();
    for (const ln of lns) {
      const g = byEnd.get(ln.end) ?? [];
      g.push(ln);
      byEnd.set(ln.end, g);
    }
    for (const [, group] of byEnd) {
      const total = group.length;
      if (total < 2) continue;
      const startCount = new Map<number, number>();
      for (const ln of group) startCount.set(ln.start, (startCount.get(ln.start) ?? 0) + 1);
      let sameStartPairs = 0;
      for (const c of startCount.values()) sameStartPairs += (c * (c - 1)) / 2;
      arCount += (total * (total - 1)) / 2 - sameStartPairs;
    }
  }
  const ar = (arCount / lns.length) * 100;

  // Ouroboros: per-measure window path-cover hit ratio
  const winMs = beatLength * 4;
  const lnsAsNodes = lns.map(n => ({ col: n.col, start: n.start, end: n.end })).sort((a, b) => a.start - b.start);
  let ouroHits = 0, ouroWindows = 0;
  if (lnsAsNodes.length > 0) {
    const t0 = lnsAsNodes[0]!.start;
    const buckets = new Map<number, typeof lnsAsNodes>();
    for (const ln of lnsAsNodes) {
      const wi = Math.floor((ln.start - t0) / winMs);
      const g = buckets.get(wi) ?? [];
      g.push(ln);
      buckets.set(wi, g);
    }
    for (const [, wlns] of buckets) { ouroWindows++; if (computeStrictOuroboros(wlns, winMs) > 0) ouroHits++; }
  }
  const ouroboros = ouroWindows > 0 ? (ouroHits / ouroWindows) * 100 : 0;

  // Shield: normal → LN same column within LN_WIN — O(k + n) column-grouped
  const [normByCol, lnByCol] = [Array.from({ length: 4 }, () => [] as NoteInfo[]), Array.from({ length: 4 }, () => [] as NoteInfo[])];
  for (const n of normals) normByCol[n.col]!.push(n);
  for (const ln of lns) lnByCol[ln.col]!.push(ln);
  let shieldCount = 0;
  for (let col = 0; col < 4; col++) {
    const cNorm = normByCol[col]!.sort((a, b) => a.start - b.start);
    const cLn = lnByCol[col]!.sort((a, b) => a.start - b.start);
    let li = 0;
    for (const n of cNorm) {
      while (li < cLn.length && cLn[li]!.start < n.start) li++;
      if (li < cLn.length && cLn[li]!.start - n.start <= LN_WIN) shieldCount++;
    }
  }
  const shield = lns.length > 0 ? (shieldCount / Math.max(1, normals.length)) * 100 : 0;

  // Reversed shield: LN tail → normal same column within LN_WIN — O(k + n)
  let revShieldCount = 0;
  for (let col = 0; col < 4; col++) {
    const cLn = lnByCol[col]!.sort((a, b) => a.end - b.end);
    const cNorm = normByCol[col]!.sort((a, b) => a.start - b.start);
    let ni = 0;
    for (const ln of cLn) {
      while (ni < cNorm.length && cNorm[ni]!.start < ln.end) ni++;
      if (ni < cNorm.length && cNorm[ni]!.start - ln.end <= LN_WIN) revShieldCount++;
    }
  }
  const reversedShield = lns.length > 0 ? (revShieldCount / lns.length) * 100 : 0;

  // Column lock: LN body with ≥2 hits on adjacent column — O(k × col_notes) column-grouped
  let clCount = 0;
  const HANDS: [number, number][] = [[0, 1], [2, 3]];
  const notesByCol: NoteInfo[][] = [notes.filter(n => n.col === 0), notes.filter(n => n.col === 1), notes.filter(n => n.col === 2), notes.filter(n => n.col === 3)];
  // Pre-sort for potential binary search (though linear scan is fine for typical column density)
  for (const colNotes of notesByCol) colNotes.sort((a, b) => a.start - b.start);
  for (const ln of lns) {
    const hand = HANDS.find(h => h[0] === ln.col || h[1] === ln.col);
    if (!hand) continue;
    const adjCol = hand[0] === ln.col ? hand[1] : hand[0];
    let hits = 0;
    for (const n of notesByCol[adjCol]!) {
      if (n.start > ln.end) break; // past LN body
      if (n.start >= ln.start) hits++;
      if (hits >= 2) break;
    }
    if (hits >= 2) clCount++;
  }
  const columnLock = lns.length > 0 ? (clCount / lns.length) * 100 : 0;

  // JS/HS density: directional row movement — O(m log m) via merge-sort grouping
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);
  const rowGroups: Array<{ time: number; cols: number[] }> = [];
  for (const n of sortedNotes) {
    if (rowGroups.length > 0 && n.start - rowGroups[rowGroups.length - 1]!.time <= 5) {
      const last = rowGroups[rowGroups.length - 1]!;
      if (!last.cols.includes(n.col)) last.cols.push(n.col);
    } else {
      rowGroups.push({ time: n.start, cols: [n.col] });
    }
  }
  const sortedRows = rowGroups.map(r => [r.time, r.cols] as [number, number[]]);
  let jsCnt = 0, hsCnt = 0;
  for (let i = 1; i < sortedRows.length; i++) {
    const prevCols = sortedRows[i - 1]![1];
    const currCols = sortedRows[i]![1];
    if (currCols.length > prevCols.length) hsCnt++;
    const overlap = currCols.some(c => prevCols.includes(c));
    if (!overlap) jsCnt++;
  }
  const rowCount = Math.max(1, sortedRows.length);
  const jsDensity = (jsCnt / rowCount) * 100;
  const hsDensity = (hsCnt / rowCount) * 100;

  // Tree: ≥75% of LNs participate in T→H edges (but not strict ouroboros)
  let tree = 0;
  if (ouroboros < 30) {
    const tEdges = buildEdges(lns.map(n => ({ col: n.col, start: n.start, end: n.end })));
    if (tEdges.length > 0) {
      const connected = new Set<number>();
      for (const e of tEdges) { connected.add(e.from.col * 100000 + e.from.start); connected.add(e.to.col * 100000 + e.to.start); }
      if (connected.size / Math.max(1, lns.length) >= 0.75) tree = 100;
    }
  }

  // Speedy WC / Jacky WC: directional vs same-column between rows (all notes)
  let speedy = 0, jacky = 0;
  for (let i = 1; i < sortedRows.length; i++) {
    const prev = sortedRows[i - 1]![1], curr = sortedRows[i]![1];
    if (curr.some(c => prev.includes(c))) jacky++;
    const pMin = Math.min(...prev), pMax = Math.max(...prev);
    const cMin = Math.min(...curr), cMax = Math.max(...curr);
    if (cMax < pMin || cMin > pMax) speedy++;
  }
  const wcRowCount = Math.max(1, sortedRows.length - 1);
  const speedyWC = (speedy / wcRowCount) * 100;
  const jackyWC = (jacky / wcRowCount) * 100;

  return { inverse, overlay, ar, tapLN, ouroboros, tree, shield, reversedShield, columnLock, jsDensity, hsDensity, speedyWC, jackyWC };
}

export function classifyLNCell(
  metrics: LNMetrics,
): { lnSubtype: string; lnSubtypes: Array<{ key: string; name: string; value: string }> } {
  const triggered: Array<{ key: string; name: string; value: string }> = [];

  if (metrics.shield >= 15) {
    triggered.push({ key: "shield", name: "Shield", value: `Sh${Math.round(metrics.shield)}%` });
  }
  if (metrics.reversedShield >= 15) {
    triggered.push({ key: "reversedshield", name: "Reversed Shield", value: `RS${Math.round(metrics.reversedShield)}%` });
  }
  if (metrics.columnLock >= 15) {
    triggered.push({ key: "collock", name: "Column Lock", value: `CL${Math.round(metrics.columnLock)}%` });
  }
  if (metrics.overlay >= 30 && metrics.ar >= 20) {
    triggered.push({ key: "releasehell", name: "Timing Hell", value: `Ov${Math.round(metrics.overlay)}/AR${Math.round(metrics.ar)}` });
  }
  if (metrics.ouroboros >= 30) {
    triggered.push({ key: "ouroboros", name: "Ouroboros", value: `${Math.round(metrics.ouroboros)}%` });
  }
  if (metrics.tree >= 1) {
    triggered.push({ key: "tree", name: "LN Tree", value: "Tree" });
  }
  if (metrics.inverse >= 20) {
    triggered.push({ key: "inverse", name: "LN Inverse", value: `${Math.round(metrics.inverse)}%` });
  }
  if (metrics.jsDensity >= 15) {
    triggered.push({ key: "jsdensity", name: "JS Density", value: `JS${Math.round(metrics.jsDensity)}%` });
  }
  if (metrics.hsDensity >= 10) {
    triggered.push({ key: "hsdensity", name: "HS Density", value: `HS${Math.round(metrics.hsDensity)}%` });
  }
  if (metrics.speedyWC >= 50) {
    triggered.push({ key: "speedywc", name: "Speedy WC", value: `Sp${Math.round(metrics.speedyWC)}%` });
  }
  if (metrics.jackyWC >= 20) {
    triggered.push({ key: "jackywc", name: "Jacky WC", value: `Jk${Math.round(metrics.jackyWC)}%` });
  }
  if (metrics.tapLN >= 40) {
    triggered.push({ key: "density", name: "Density", value: `Tap${Math.round(metrics.tapLN)}%` });
  }

  // Primary subtype: aligned with section priority (Ouroboros → Inverse → Tree → Timing Hell → Density → Speedy WC → Jacky WC)
  let lnSubtype = "LN Unknown";
  if (metrics.ouroboros >= 30) lnSubtype = "Ouroboros";
  else if (metrics.inverse >= 20) lnSubtype = "LN Inverse";
  else if (metrics.tree >= 1) lnSubtype = "LN Tree";
  else if (metrics.overlay >= 30 && metrics.ar >= 20) lnSubtype = "Timing Hell";
  else if (metrics.tapLN >= 40) lnSubtype = "Density";
  else if (metrics.speedyWC >= 50) lnSubtype = "Speedy WC";
  else if (metrics.jackyWC >= 20) lnSubtype = "Jacky WC";

  return { lnSubtype, lnSubtypes: triggered };
}
