// ============================================================
// Jack Class & Stamina — run-extraction based classification.
//
// Class  : "Actually Not Jack" | "Speedjack" | "Bullet / Minijack"
//          | "{Low|Mid|High} Chordjack" | "Anchor / X Chordjack"
// Stamina: burst (longest streak) + sum (all streaks), each with the
//          note count inside the covered rows (player pressure).
//
// Definition (per design sessions 2026-08):
//   link    = two ADJACENT rows sharing a column (no row in between)
//   cluster = greedy ±15% grouping of link intervals; dominant cluster
//             + secondaries with ≥10% share and eff≥60 (过渡段规则)
//   chain   = maximal consecutive links on one column → x连
//   streak  = continuous jack-row flow; tolerates a single non-jack
//             transition; broken by two consecutive non-jack rows, an
//             empty row slot, or an off-grid (切键) row
// ============================================================

import type { ParsedBeatmap } from "../types/beatmap.js";
import type { JackClassInfo } from "../types/custom.js";

interface Row { t: number; cols: number[]; }
interface Link { col: number; dt: number; rowI: number; }
interface Cluster { center: number; count: number; eff: number; }
interface Streak { startRow: number; endRow: number; sec: number; notes: number; }

const TOL = 0.18;

// Classification thresholds
const JACK_MIN_NOTES = 20;      // below this → not jack
const SUM_COV_PCT = 25;         // sum condition: streak coverage of map ≥25%
const GEN_KPS = 4.5;            // general condition: jack run keys per second
const GEN_PEAK = 6.5;           // general condition: peak run keys/s (10s window)
const P3_LOW_PCT = 15;          // p3 below this → Bullet / Minijack
const DENSITY_LOW = 8;          // chordjack density bands (key/s)
const DENSITY_HIGH = 15;
const ANCHOR_CONF_MIN = 70;     // anchor prefix threshold (product confidence)
const SECONDARY_MIN_SHARE = 0.10;
const SECONDARY_MIN_EFF = 60;   // 非主导簇须达到 jack 速度域

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function buildRows(parsed: ParsedBeatmap, speedRate: number): Row[] {
  const notes: Array<{ col: number; t: number }> = [];
  for (let i = 0; i < parsed.noteStarts.length; i++) {
    // Played time: DT/HT scale intervals by 1/speedRate.
    notes.push({ col: parsed.columns[i] ?? 0, t: parsed.noteStarts[i]! / speedRate });
  }
  notes.sort((a, b) => a.t - b.t);
  const rows: Row[] = [];
  for (const n of notes) {
    const last = rows[rows.length - 1];
    if (last && last.t === n.t) last.cols.push(n.col);
    else rows.push({ t: n.t, cols: [n.col] });
  }
  return rows;
}

function buildLinks(rows: Row[]): Link[] {
  const links: Link[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const dt = rows[i + 1]!.t - rows[i]!.t;
    if (dt <= 0 || dt > 1500) continue;
    for (const c of rows[i + 1]!.cols) {
      if (rows[i]!.cols.includes(c)) links.push({ col: c, dt, rowI: i });
    }
  }
  return links;
}

/** Greedy ±15% clustering of link intervals → cadence groups. */
function clusterIntervals(links: Link[]): Cluster[] {
  const dts = links.map((l) => l.dt).sort((a, b) => a - b);
  const out: Cluster[] = [];
  let cur: number[] = [];
  for (const dt of dts) {
    if (cur.length && dt > (cur.reduce((s, v) => s + v, 0) / cur.length) * 1.15) {
      const c = cur.reduce((s, v) => s + v, 0) / cur.length;
      out.push({ center: c, count: cur.length, eff: Math.round(15000 / c) });
      cur = [];
    }
    cur.push(dt);
  }
  if (cur.length) {
    const c = cur.reduce((s, v) => s + v, 0) / cur.length;
    out.push({ center: c, count: cur.length, eff: Math.round(15000 / c) });
  }
  return out.filter((c) => c.count >= 4);
}

/** Maximal same-column chains (x连) at a cadence. */
function chainsAt(links: Link[], center: number): Array<{ startRow: number; len: number }> {
  const perCol = new Map<number, number[]>();
  for (const l of links) {
    if (Math.abs(l.dt - center) > center * TOL) continue;
    const arr = perCol.get(l.col) ?? [];
    arr.push(l.rowI);
    perCol.set(l.col, arr);
  }
  const chains: Array<{ startRow: number; len: number }> = [];
  for (const [, rowIs] of perCol) {
    rowIs.sort((a, b) => a - b);
    let len = 2;
    for (let i = 1; i < rowIs.length; i++) {
      if (rowIs[i] === rowIs[i - 1]! + 1) len++;
      else { chains.push({ startRow: rowIs[i - 1]! - len + 2, len }); len = 2; }
    }
    if (rowIs.length) chains.push({ startRow: rowIs[rowIs.length - 1]! - len + 2, len });
  }
  return chains;
}

/**
 * Jack-row streaks at a cadence: adjacent rows spaced ≈C, jack when rows
 * share a column. A single non-jack transition is tolerated (resolved by
 * the next jack); broken by two consecutive non-jack rows, an empty row
 * slot (dt≈2C), or an off-grid row (切键).
 */
function jackStreaks(rows: Row[], C: number, tol = TOL): Streak[] {
  const streaks: Streak[] = [];
  let start = -1, lastJack = -1, pending = false;
  const close = (endRow: number) => {
    if (start >= 0 && lastJack > start) {
      let notes = 0;
      for (let r = start; r <= endRow; r++) notes += rows[r]!.cols.length;
      streaks.push({ startRow: start, endRow, sec: (rows[endRow]!.t - rows[start]!.t) / 1000 + C / 1000, notes });
    }
    start = -1; lastJack = -1; pending = false;
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const dt = rows[i + 1]!.t - rows[i]!.t;
    if (Math.abs(dt - C) > C * tol) { close(pending ? lastJack : i); continue; }
    const jack = rows[i + 1]!.cols.some((c) => rows[i]!.cols.includes(c));
    if (jack) {
      if (start < 0) start = i;
      lastJack = i + 1;
      pending = false;
    } else {
      if (start < 0) continue;
      if (pending) { close(lastJack); continue; }
      pending = true;
    }
  }
  close(pending ? lastJack : rows.length - 1);
  return streaks;
}

/**
 * Compute the jack class label and burst/sum stamina for a beatmap.
 * speedRate scales note times into played time (DT=1.5 → faster).
 */
export function computeJackClass(parsed: ParsedBeatmap, speedRate = 1): JackClassInfo {
  const notJack: JackClassInfo = {
    className: "Actually Not Jack", eff: 0, isJack: false,
    burstSec: 0, burstNotes: 0, burstBroken: false, sumSec: 0, sumNotes: 0,
  };
  if (parsed.noteStarts.length < JACK_MIN_NOTES) return notJack;

  const rows = buildRows(parsed, speedRate);
  const links = buildLinks(rows);
  // Sort by link count: clusters[0] must be the DOMINANT cadence
  // (clusterIntervals emits ascending-dt order, i.e. fastest first).
  const clusters = clusterIntervals(links).sort((a, b) => b.count - a.count);
  if (!clusters.length) return notJack;
  const total = clusters.reduce((s, c) => s + c.count, 0);
  const use = clusters.filter((c, i) => i === 0 || (c.count / total >= SECONDARY_MIN_SHARE && c.eff >= SECONDARY_MIN_EFF));
  const dur = parsed.duration / 1000 / speedRate;
  if (dur <= 0) return notJack;

  // ---- Stamina: pooled streaks over qualifying clusters ----
  const allStreaks: Streak[] = [];
  for (const c of use) allStreaks.push(...jackStreaks(rows, c.center));
  let sumSec = 0, burstSec = 0, burstNotes = 0;
  const coveredRows = new Set<number>();
  for (const st of allStreaks) {
    sumSec += st.sec;
    if (st.sec > burstSec) { burstSec = st.sec; burstNotes = st.notes; }
    for (let r = st.startRow; r <= st.endRow; r++) coveredRows.add(r);
  }
  let sumNotes = 0;
  for (const r of coveredRows) sumNotes += rows[r]!.cols.length;
  const covPct = 100 * sumSec / dur;

  // Half-measure merge: always re-take the max over streak groups whose
  // gaps are within a half measure — durations and note counts accumulate,
  // gap time is NOT counted. The Broken marker is kept only for the case
  // where a sub-10s single max crosses 10s through merging.
  let burstBroken = false;
  if (allStreaks.length) {
    const tp = parsed.timingPoints.find((t) => t.uninherited && t.beatLength > 0);
    const halfMeasureMs = (2 * (tp ? tp.beatLength : 500)) / speedRate;
    const sorted = [...allStreaks].sort((a, b) => rows[a.startRow]!.t - rows[b.startRow]!.t);
    let bestSec = 0, bestNotes = 0, curSec = 0, curNotes = 0, prevEnd = -Infinity;
    for (const st of sorted) {
      const startT = rows[st.startRow]!.t;
      if (prevEnd > -Infinity && startT - prevEnd > halfMeasureMs) {
        if (curSec > bestSec) { bestSec = curSec; bestNotes = curNotes; }
        curSec = 0; curNotes = 0;
      }
      curSec += st.sec; curNotes += st.notes;
      prevEnd = rows[st.endRow]!.t;
    }
    if (curSec > bestSec) { bestSec = curSec; bestNotes = curNotes; }
    if (bestSec > 0) {
      burstBroken = burstSec < 10 && bestSec > 10;
      burstSec = bestSec;
      burstNotes = bestNotes;
    }
  }

  // ---- Combined run stats over qualifying clusters ----
  const allChains = use.flatMap((c) => chainsAt(links, c.center));
  const keys = allChains.reduce((s, c) => s + c.len, 0);
  let k3 = 0, k5 = 0, x2 = 0, r5 = 0;
  for (const c of allChains) {
    x2 += c.len * c.len;
    if (c.len >= 3) k3 += c.len;
    if (c.len >= 5) { k5 += c.len; r5++; }
  }
  const p3 = keys ? 100 * k3 / keys : 0;
  const k5p = keys ? 100 * k5 / keys : 0;
  const avgKey = keys ? x2 / keys : 0;
  const kps = keys / dur;
  const peakBuckets = new Map<number, number>();
  for (const c of allChains) {
    if (c.startRow < 0 || c.startRow >= rows.length) continue;
    const w = Math.max(0, Math.floor(rows[c.startRow]!.t / 10000));
    peakBuckets.set(w, (peakBuckets.get(w) ?? 0) + c.len);
  }
  const peak = Math.max(0, ...peakBuckets.values()) / 10;

  // ---- Classification ----
  const sumCond = covPct >= SUM_COV_PCT;
  const genCond = kps >= GEN_KPS && peak >= GEN_PEAK;
  if (!genCond && !sumCond) return { ...notJack, burstSec, burstNotes, sumSec, sumNotes };

  const density = kps < DENSITY_LOW ? "Low" : kps < DENSITY_HIGH ? "Mid" : "High";
  // Anchor confidence: k5+ share × average run depth × 5+ run presence
  const m1 = k5p < 10 ? 0 : k5p <= 50 ? clamp01((k5p - 10) / 15) : clamp01(1 - (k5p - 50) / 20);
  const m2 = clamp01((avgKey - 2.8) / 1.2);
  const m3 = clamp01((r5 - 5) / 10);
  const anchorConf = 100 * m1 * m2 * m3;
  let type: string;
  if (genCond) {
    if (anchorConf >= ANCHOR_CONF_MIN) type = `Anchor / ${density} Chordjack`;
    else if (p3 < P3_LOW_PCT) type = "Bullet / Minijack";
    else type = `${density} Chordjack`;
  } else {
    type = "Speedjack";
  }
  return {
    className: `${clusters[0]!.eff} ${type}`,
    eff: clusters[0]!.eff,
    isJack: true,
    burstSec, burstNotes, burstBroken, sumSec, sumNotes,
  };
}
