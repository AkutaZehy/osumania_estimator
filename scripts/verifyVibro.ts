// Old findLian4 + analyzeVibro (pre-optimization) vs current module output.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeVibro, type VibroResult } from "../src/custom/vibroAnalysis.js";

interface Note { col: number; t: number }

// ---- OLD findLian4 (verbatim) ----
function oldFindLian4(notes: Note[], beatMs: number) {
  const colNotes: number[][] = [[], [], [], []];
  const timeToCols = new Map<number, number[]>();
  for (const n of notes) {
    colNotes[n.col]!.push(n.t);
    if (!timeToCols.has(n.t)) timeToCols.set(n.t, []);
    timeToCols.get(n.t)!.push(n.col);
  }
  for (let c = 0; c < 4; c++) colNotes[c]!.sort((a, b) => a - b);
  const maxGap = beatMs / 4 + 10;
  const result: { col: number; t: number[] }[] = [];
  for (let c = 0; c < 4; c++) {
    const times = colNotes[c]!;
    let i = 0;
    while (i < times.length) {
      const seq = [times[i]!];
      const offsetPatterns = new Map<number, number[]>();
      let j = i + 1;
      while (j < times.length) {
        const gap = times[j]! - seq[seq.length - 1]!;
        if (gap > maxGap) break;
        const betweenNotes: { col: number; offset: number }[] = [];
        for (const [ot, cols] of timeToCols) {
          if (ot <= seq[seq.length - 1]! || ot >= times[j]!) continue;
          for (const oc of cols) if (oc !== c) betweenNotes.push({ col: oc, offset: ot - seq[seq.length - 1]! });
        }
        let isTrill = true;
        for (const bn of betweenNotes) {
          if (!offsetPatterns.has(bn.col)) offsetPatterns.set(bn.col, []);
          offsetPatterns.get(bn.col)!.push(bn.offset);
          const offsets = offsetPatterns.get(bn.col)!;
          if (offsets.length >= 2) {
            const avgPrev = offsets.slice(0, -1).reduce((a, b) => a + b, 0) / (offsets.length - 1);
            if (Math.abs(bn.offset - avgPrev) > 5) isTrill = false;
          }
        }
        if (betweenNotes.length > 0 && !isTrill) break;
        seq.push(times[j]!);
        j++;
      }
      if (seq.length >= 4) result.push({ col: c, t: seq });
      i = j;
    }
  }
  return result;
}

// ---- OLD analyzeVibro main loop (verbatim) ----
function oldAnalyzeVibro(notes: Note[], bpm: number): VibroResult {
  const beatMs = 60000 / bpm;
  const all = oldFindLian4(notes, beatMs);
  if (all.length === 0) {
    return { totalLian4: 0, totalCV: 0, types: { S: 0, H: 0, F: 0, C: 0 }, typeCv: { S: 0, H: 0, F: 0, C: 0 }, verdict: "no_vibro", burst: 0, control: 0, burstMs: 0, controlMs: 0, displayType: null, displayCvRate: null };
  }
  const typeData: Record<string, { n: number; cv: number }> = { S: { n: 0, cv: 0 }, H: { n: 0, cv: 0 }, F: { n: 0, cv: 0 }, C: { n: 0, cv: 0 } };
  let totalCV = 0; let burstN = 0, controlN = 0; let burstMs = 0, controlMs = 0;
  for (const s of all) {
    const { col, t: tt } = s;
    const L = tt.length, st = tt[0]!, et = tt[L - 1]!, sd = (et - st) / Math.max(1, L - 1);
    const occ = [new Set<number>(), new Set<number>(), new Set<number>(), new Set<number>()];
    const offs: number[] = [];
    for (const n of notes) {
      if (n.t < st || n.t > et) continue;
      const pos = Math.round((n.t - st) / sd);
      if (pos >= 0 && pos < L) occ[n.col]!.add(pos);
      if (n.col !== col) offs.push((((n.t - st) % sd) + sd) % sd / sd);
    }
    const d = occ.map(o => o.size / L);
    const dc = d.filter(x => x >= 0.6).length;
    let tp: string;
    if (dc >= 4) tp = "F";
    else if (dc === 1 && d.filter(x => x <= 0.3).length >= 3) tp = "S";
    else if ((d[0]! + d[1]!) / 2 >= 0.6 && (d[2]! + d[3]!) / 2 <= 0.3) tp = "H";
    else if ((d[2]! + d[3]!) / 2 >= 0.6 && (d[0]! + d[1]!) / 2 <= 0.3) tp = "H";
    else tp = "C";
    const sameHand: number[] = col < 2 ? [1 - col] : [5 - col];
    let canV = false; let seqWeight = 1;
    for (const a of sameHand) {
      const pat = Array.from({ length: L }, (_, p) => occ[a]!.has(p) ? "1" : "0").join("");
      const r = checkCanVibroAdj(pat, L, 2);
      if (r.cv) { canV = true; seqWeight = r.valid / r.total; break; }
    }
    typeData[tp]!.n++;
    typeData[tp]!.cv += canV ? seqWeight : 0;
    totalCV += canV ? seqWeight : 0;
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
  let verdict: "no_vibro" | "suspicious" | "vibro" = "suspicious";
  if (t === 0) verdict = "no_vibro";
  else if (cvPct > 0.35 && bpm >= 150) {
    const hOk = typeData.H!.n >= 5 && typeData.H!.cv / typeData.H!.n > 0.6;
    const fOk = typeData.F!.n >= 10 && typeData.F!.cv / typeData.F!.n > 0.5;
    const cOk = typeData.C!.n >= 5 && typeData.C!.cv / typeData.C!.n > 0.7;
    const sOk = typeData.S!.n >= 5 && typeData.S!.cv / typeData.S!.n > 0.5;
    if (hOk || fOk || cOk || sOk) verdict = "vibro";
  }
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
    const candidates = [
      { label: "Hand", ok: hOk2, n: typeData.H!.n, cvRate: hCvRate },
      { label: "Full", ok: fOk2, n: typeData.F!.n, cvRate: fCvRate },
      { label: "Common", ok: cOk2, n: typeData.C!.n, cvRate: cCvRate },
      { label: "Single", ok: sOk2, n: typeData.S!.n, cvRate: sCvRate },
    ];
    const best = candidates.filter(c => c.ok).sort((a, b) => b.n - a.n)[0]
      ?? candidates.filter(c => c.n > 0).sort((a, b) => b.n - a.n)[0];
    if (best) { displayType = best.label; displayCvRate = Math.round(best.cvRate * 100); }
  }
  return { totalLian4: t, types: { S: typeData.S!.n, H: typeData.H!.n, F: typeData.F!.n, C: typeData.C!.n }, typeCv: { S: typeData.S!.cv, H: typeData.H!.cv, F: typeData.F!.cv, C: typeData.C!.cv }, totalCV, verdict, burst: burstN, control: controlN, burstMs, controlMs, displayType, displayCvRate };
}

// ---- canVibro helpers (unchanged in module; replicated verbatim) ----
function hasConsecutive(pat: string, k: number): boolean {
  let run = 0;
  for (const ch of pat) { if (ch === "1") { run++; if (run >= k) return true; } else run = 0; }
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
  for (let i = 1; i < adjNotes.length; i++) if (adjNotes[i]! - adjNotes[i - 1]! - 1 < N) return false;
  return true;
}
function complexSplitCanVibro(main: string, adj: string, N: number): { cv: boolean; valid: number; total: number } {
  const L = main.length;
  const totalGroups = L / 4;
  let bestValid = 0;
  for (let splitAt = 4; splitAt < L; splitAt += 4) {
    let v = 0;
    if (splitAt >= 4) { if (canVibroSimple(main.substring(0, splitAt), adj.substring(0, splitAt), N)) v++; }
    const tailL = L - splitAt;
    if (tailL >= 4) { if (canVibroSimple(main.substring(splitAt), adj.substring(splitAt), N)) v++; }
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
    if (adjNotes[i]! - adjNotes[i - 1]! - 1 < N) { hasAntiMash = true; break; }
  }
  if (!hasAntiMash) return { cv: true, valid: 1, total: 1 };
  if (L >= 8 && hasConsecutive(adjPattern, 4)) {
    return complexSplitCanVibro(mainPattern, adjPattern, N);
  }
  return { cv: false, valid: 0, total: 1 };
}

// ---- Compare old vs new across all maps ----
const walk = (dir: string, out: string[]): void => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "NEVER TEST IT UNLESS I ASKED YOU") continue; walk(p, out); }
    else if (e.name.endsWith(".osu")) out.push(p);
  }
};
const maps: string[] = [];
walk("maps", maps);
let bad = 0, withSeq = 0;
for (const f of maps) {
  const text = readFileSync(f, "utf8");
  try {
    const parser = new OsuFileParser(text); parser.process();
    const parsed = parser.getParsedData();
    const notes: Note[] = parsed.columns.map((col, i) => ({ col, t: parsed.noteStarts[i]! })).filter(n => n.t >= 0);
    const tp = parsed.timingPoints.find(t => t.uninherited);
    const bpm = tp ? 60000 / tp.beatLength : 120;
    const oldR = oldAnalyzeVibro(notes, bpm);
    const newR = analyzeVibro(notes, bpm);
    if (oldR.totalLian4 > 0) withSeq++;
    if (JSON.stringify(oldR) !== JSON.stringify(newR)) {
      bad++;
      console.log(`MISMATCH: ${f.split(/[\\/]/).slice(-1)[0]}  old=${oldR.totalLian4} new=${newR.totalLian4}`);
    }
  } catch { /* skip */ }
}
console.log(`${maps.length} maps, ${withSeq} with lian4 sequences, ${bad} mismatches`);
