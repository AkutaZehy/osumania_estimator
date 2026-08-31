// ============================================================
// Vibro Analysis — 连4 + canVibro + SHFC classification
// ============================================================

import { lowerBound, upperBound } from "../utils/beatmapUtils.js";

export interface VibroResult {
  /** Total 连4 sequences found */
  totalLian4: number;
  /** Per-type breakdown */
  types: { S: number; H: number; F: number; C: number };
  /** Per-type canVibro count (fractional for R5 partial) */
  typeCv: { S: number; H: number; F: number; C: number };
  /** Total canVibro (fractional) */
  totalCV: number;
  /** Verdict */
  verdict: "no_vibro" | "suspicious" | "vibro";
  /** Burst-type lian4 count (neat/aligned: single-col jack or same-grid columns) */
  burst: number;
  /** Control-type lian4 count (staggered/offset columns) */
  control: number;
  /** Total time (ms) covered by Burst sequences */
  burstMs: number;
  /** Total time (ms) covered by Control sequences */
  controlMs: number;
  /** Dominant qualifying type for display */
  displayType: string | null;
  /** CanVibro rate of the display type */
  displayCvRate: number | null;
}

interface Note { col: number; t: number }

/** Main entry: analyze vibro from parsed notes + BPM */
export function analyzeVibro(notes: Note[], bpm: number): VibroResult {
  const beatMs = 60000 / bpm;
  // Per-column sorted time arrays, shared by findLian4 and the per-sequence window scan.
  const colNotes: number[][] = [[], [], [], []];
  for (const n of notes) colNotes[n.col]!.push(n.t);
  for (let c = 0; c < 4; c++) colNotes[c]!.sort((a, b) => a - b);

  const all = findLian4(colNotes, beatMs);

  if (all.length === 0) {
    return {
      totalLian4: 0, totalCV: 0,
      types: { S: 0, H: 0, F: 0, C: 0 },
      typeCv: { S: 0, H: 0, F: 0, C: 0 },
      verdict: "no_vibro", burst: 0, control: 0, burstMs: 0, controlMs: 0, displayType: null, displayCvRate: null,
    };
  }

  const typeData: Record<string, { n: number; cv: number }> = { S: { n: 0, cv: 0 }, H: { n: 0, cv: 0 }, F: { n: 0, cv: 0 }, C: { n: 0, cv: 0 } };
  let totalCV = 0;
  let burstN = 0, controlN = 0;
  let burstMs = 0, controlMs = 0;

  for (const s of all) {
    const { col, t: tt } = s;
    const L = tt.length, st = tt[0]!, et = tt[L-1]!, sd = (et - st) / Math.max(1, L - 1);
    const occ = [new Set<number>(), new Set<number>(), new Set<number>(), new Set<number>()];
    // Other-column note offsets relative to the main-column grid, in units of sd
    const offs: number[] = [];
    // Window-scan only the notes inside [st, et] per column (binary search),
    // instead of the whole map per sequence (O(seq × notes) on dense maps).
    for (let c2 = 0; c2 < 4; c2++) {
      const ctimes = colNotes[c2]!;
      const lo = lowerBound(ctimes, st);
      const hi = upperBound(ctimes, et);
      for (let k = lo; k < hi; k++) {
        const t2 = ctimes[k]!;
        const pos = Math.round((t2 - st) / sd);
        if (pos >= 0 && pos < L) occ[c2]!.add(pos);
        if (c2 !== col) offs.push((((t2 - st) % sd) + sd) % sd / sd);
      }
    }
    const d = occ.map(o => o.size / L);
    const dc = d.filter(x => x >= 0.6).length;

    let tp: string;
    if (dc >= 4) tp = "F";
    else if (dc === 1 && d.filter(x => x <= 0.3).length >= 3) tp = "S";
    else if ((d[0]!+d[1]!)/2 >= 0.6 && (d[2]!+d[3]!)/2 <= 0.3) tp = "H";
    else if ((d[2]!+d[3]!)/2 >= 0.6 && (d[0]!+d[1]!)/2 <= 0.3) tp = "H";
    else tp = "C";

    // Same-hand adjacency only
    const sameHand: number[] = col < 2 ? [1 - col] : [5 - col]; // col 0→1, 1→0, 2→3, 3→2
    let canV = false;
    let seqWeight = 1;
    for (const a of sameHand) {
      const pat = Array.from({ length: L }, (_, p) => occ[a]!.has(p) ? "1" : "0").join("");
      const r = checkCanVibroAdj(pat, L, 2);
      if (r.cv) { canV = true; seqWeight = r.valid / r.total; break; }
    }

    typeData[tp]!.n++;
    typeData[tp]!.cv += canV ? seqWeight : 0;
    totalCV += canV ? seqWeight : 0;

    // Burst/Control: burst = pure single-col jack, or other columns on the same grid
    let isBurst: boolean;
    if (offs.length === 0) isBurst = true;
    else {
      const aligned = offs.filter(o => o < 0.15 || o > 0.85).length;
      const staggered = offs.filter(o => o >= 0.35 && o <= 0.65).length;
      isBurst = aligned > staggered;
    }
    if (isBurst) { burstN++; burstMs += et - st; }
    else { controlN++; controlMs += et - st; }
  }

  const t = all.length;
  const cvPct = totalCV / t;

  // Verdict
  let verdict: "no_vibro" | "suspicious" | "vibro" = "suspicious";
  if (t === 0) verdict = "no_vibro";
  else if (cvPct > 0.35 && bpm >= 150) {
    const hOk = typeData.H!.n >= 5 && typeData.H!.cv / typeData.H!.n > 0.6;
    const fOk = typeData.F!.n >= 10 && typeData.F!.cv / typeData.F!.n > 0.5;
    const cOk = typeData.C!.n >= 5 && typeData.C!.cv / typeData.C!.n > 0.7;
    const sOk = typeData.S!.n >= 5 && typeData.S!.cv / typeData.S!.n > 0.5;
    if (hOk || fOk || cOk || sOk) verdict = "vibro";
  }

    // Determine display type (qualifying type with highest count)
    let displayType: string | null = null;
    let displayCvRate: number | null = null;
    if (verdict === "vibro") {
      const hCvRate = typeData.H!.n > 0 ? typeData.H!.cv / typeData.H!.n : 0;
      const fCvRate = typeData.F!.n > 0 ? typeData.F!.cv / typeData.F!.n : 0;
      const cCvRate = typeData.C!.n > 0 ? typeData.C!.cv / typeData.C!.n : 0;
      const sCvRate = typeData.S!.n > 0 ? typeData.S!.cv / typeData.S!.n : 0;
      const hOk2 = typeData.H!.n >= 5 && hCvRate > 0.6;
      const fOk2 = typeData.F!.n >= 10 && fCvRate > 0.5;
      const cOk2 = typeData.C!.n >= 5 && cCvRate > 0.7;
      const sOk2 = typeData.S!.n >= 5 && sCvRate > 0.5;
      const candidates: { label: string; ok: boolean; n: number; cvRate: number }[] = [
        { label: "Hand", ok: hOk2, n: typeData.H!.n, cvRate: hCvRate },
        { label: "Full", ok: fOk2, n: typeData.F!.n, cvRate: fCvRate },
        { label: "Common", ok: cOk2, n: typeData.C!.n, cvRate: cCvRate },
        { label: "Single", ok: sOk2, n: typeData.S!.n, cvRate: sCvRate },
      ];
      const best = candidates.filter(c => c.ok).sort((a, b) => b.n - a.n)[0]
        ?? candidates.filter(c => c.n > 0).sort((a, b) => b.n - a.n)[0];
      if (best) {
        displayType = best.label;
        displayCvRate = Math.round(best.cvRate * 100);
      }
    }

  return {
    totalLian4: t,
    types: { S: typeData.S!.n, H: typeData.H!.n, F: typeData.F!.n, C: typeData.C!.n },
    typeCv: { S: typeData.S!.cv, H: typeData.H!.cv, F: typeData.F!.cv, C: typeData.C!.cv },
    totalCV,
    verdict,
    burst: burstN,
    control: controlN,
    burstMs,
    controlMs,
    displayType: verdict === "vibro" ? displayType : null,
    displayCvRate: verdict === "vibro" ? displayCvRate : null,
  };
}

// ========== Internal helpers ==========

// ========== 连4 detection ==========

function findLian4(colNotes: number[][], beatMs: number) {
  const maxGap = beatMs / 4 + 10;
  const result: { col: number; t: number[] }[] = [];

  for (let c = 0; c < 4; c++) {
    const times = colNotes[c]!;
    let i = 0;
    while (i < times.length) {
      const seq = [times[i]!];
      // Per-column offsets accumulated over the run, keyed by column.
      // The original scanned the whole time map per candidate pair (O(n²) on
      // dense maps — 82% of grid time on vibro maps); windows only slide
      // forward, so monotonic pointers visit each between-note once (O(n)).
      const offsetPatterns = new Map<number, number[]>();
      const offSums = new Map<number, number>(); // running sum per column
      const ptr: number[] = [0, 0, 0, 0]; // first not-yet-examined index per column
      let j = i + 1;
      while (j < times.length) {
        const gap = times[j]! - seq[seq.length - 1]!;
        if (gap > maxGap) break;
        const prevT = seq[seq.length - 1]!;
        const currT = times[j]!;
        let isTrill = true;
        let anyBetween = false;
        for (let oc = 0; oc < 4; oc++) {
          if (oc === c) continue;
          const otimes = colNotes[oc]!;
          // Advance past times <= prevT (exclusive window start).
          let k = Math.max(ptr[oc]!, upperBound(otimes, prevT));
          ptr[oc] = k;
          for (; k < otimes.length && otimes[k]! < currT; k++) {
            anyBetween = true;
            const off = otimes[k]! - prevT;
            let offsets = offsetPatterns.get(oc);
            if (!offsets) { offsets = []; offsetPatterns.set(oc, offsets); }
            offsets.push(off);
            const sum = offSums.get(oc) ?? 0;
            if (offsets.length >= 2) {
              // avg of all previous offsets (running sum == slice(0,-1) reduce)
              const avgPrev = (sum) / (offsets.length - 1);
              if (Math.abs(off - avgPrev) > 5) isTrill = false;
            }
            offSums.set(oc, sum + off);
          }
          ptr[oc] = k;
        }
        if (anyBetween && !isTrill) break;
        seq.push(times[j]!);
        j++;
      }
      if (seq.length >= 4) result.push({ col: c, t: seq });
      i = j;
    }
  }
  return result;
}

// ========== canVibro algorithm ==========

function hasConsecutive(pat: string, k: number): boolean {
  let run = 0;
  for (const ch of pat) {
    if (ch === "1") { run++; if (run >= k) return true; }
    else run = 0;
  }
  return false;
}

function canVibroSimple(main: string, adj: string, N: number): boolean {
  const L = adj.length;
  if (L < 4) return true;
  const adjNotes: number[] = [];
  for (let i = 0; i < L; i++) if (adj[i] === "1") adjNotes.push(i);
  const n = adjNotes.length;
  if (n === 0 || n === 1) return true;
  if (main === adj) return true;
  for (let i = 1; i < adjNotes.length; i++) {
    if (adjNotes[i]! - adjNotes[i-1]! - 1 < N) return false;
  }
  return true;
}

function complexSplitCanVibro(main: string, adj: string, N: number): { cv: boolean; valid: number; total: number } {
  const L = main.length;
  const totalGroups = L / 4;
  let bestValid = 0;
  for (let splitAt = 4; splitAt < L; splitAt += 4) {
    let v = 0, t = 0;
    if (splitAt >= 4) { t++; if (canVibroSimple(main.substring(0, splitAt), adj.substring(0, splitAt), N)) v++; }
    const tailL = L - splitAt;
    if (tailL >= 4) { t++; if (canVibroSimple(main.substring(splitAt), adj.substring(splitAt), N)) v++; }
    if (v > bestValid) bestValid = v;
  }
  for (let s = 0; s < Math.min(4, L); s++) {
    const r = L - s; if (r < 4) break;
    if (canVibroSimple(main.substring(s), adj.substring(s), N)) { bestValid = Math.max(bestValid, r / 4); break; }
  }
  for (let s = 0; s < Math.min(4, L); s++) {
    const r = L - s; if (r < 4) break;
    if (canVibroSimple(main.substring(0, r), adj.substring(0, r), N)) { bestValid = Math.max(bestValid, r / 4); break; }
  }
  for (let h = 0; h < Math.min(4, L); h++)
    for (let t = 0; t < Math.min(4, L - h); t++) {
      const r = L - h - t; if (r < 4) continue;
      if (canVibroSimple(main.substring(h, L - t), adj.substring(h, L - t), N)) bestValid = Math.max(bestValid, r / 4);
    }
  if (bestValid >= totalGroups) return { cv: true, valid: totalGroups, total: totalGroups };
  if (bestValid > 0) return { cv: true, valid: bestValid, total: totalGroups };
  return { cv: false, valid: 0, total: totalGroups };
}

function checkCanVibroAdj(adjPattern: string, L: number, N: number = 2): { cv: boolean; valid: number; total: number } {
  const mainPattern = "1".repeat(L);
  const adjNotes: number[] = [];
  for (let i = 0; i < L; i++) if (adjPattern[i] === "1") adjNotes.push(i);
  const n = adjNotes.length;
  if (n === 0 || n === 1) return { cv: true, valid: 1, total: 1 };
  if (mainPattern === adjPattern) return { cv: true, valid: 1, total: 1 };
  let hasAntiMash = false;
  for (let i = 1; i < adjNotes.length; i++) {
    if (adjNotes[i]! - adjNotes[i-1]! - 1 < N) { hasAntiMash = true; break; }
  }
  if (!hasAntiMash) return { cv: true, valid: 1, total: 1 };
  if (L >= 8 && hasConsecutive(adjPattern, 4)) {
    return complexSplitCanVibro(mainPattern, adjPattern, N);
  }
  return { cv: false, valid: 0, total: 1 };
}
