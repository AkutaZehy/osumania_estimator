// ============================================================
// Strict Ouroboros Test — compare current vs strict detection
// Strict: all columns participate in T→H graph, and
//         removing any connected component leaves either
//         nothing or a still-valid ouroboros remnant.
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeSections, type SegmentLNMetrics } from "../src/custom/sectionAnalysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");

interface LNNote { col: number; start: number; end: number; isLN: true }
interface LNEdge { from: LNNote; to: LNNote; gap: number }

// ── Current ouroboros (from sectionAnalysis.ts:427-438) ──
function currentOuroboros(lns: LNNote[]): number {
  let count = 0;
  for (let i = 0; i < lns.length; i++) {
    for (let j = 0; j < lns.length; j++) {
      if (i === j) continue;
      if (Math.abs(lns[i]!.end - lns[j]!.start) < 21) count++;
    }
  }
  return lns.length > 0 ? (count / lns.length) * 100 : 0;
}

// ── Strict ouroboros ──

/** Build T→H edges: a.end → b.start gap < 21ms, any column */
function buildEdges(lns: LNNote[]): LNEdge[] {
  const edges: LNEdge[] = [];
  for (let i = 0; i < lns.length; i++) {
    for (let j = 0; j < lns.length; j++) {
      if (i === j) continue;
      const gap = lns[j]!.start - lns[i]!.end;
      if (gap >= 0 && gap < 21) {
        edges.push({ from: lns[i]!, to: lns[j]!, gap });
      }
    }
  }
  return edges;
}

/** Find connected components in the T→H graph */
function findComponents(lns: LNNote[], edges: LNEdge[]): LNNote[][] {
  const nodeIdx = new Map<LNNote, number>();
  lns.forEach((ln, i) => nodeIdx.set(ln, i));

  const adj: number[][] = Array.from({ length: lns.length }, () => []);
  for (const e of edges) {
    const fi = nodeIdx.get(e.from)!;
    const ti = nodeIdx.get(e.to)!;
    adj[fi]!.push(ti);
    // undirected for component finding
    adj[ti]!.push(fi);
  }

  const visited = new Array(lns.length).fill(false);
  const components: LNNote[][] = [];

  for (let i = 0; i < lns.length; i++) {
    if (visited[i]) continue;
    const comp: LNNote[] = [];
    const stack = [i];
    visited[i] = true;
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(lns[v]!);
      for (const nb of adj[v]!) {
        if (!visited[nb]) { visited[nb] = true; stack.push(nb); }
      }
    }
    if (comp.length > 0) components.push(comp);
  }
  return components;
}

/** Check if a set of LNs satisfies "is ouroboros" (all columns participate) */
function isAllColumnOuroboros(lns: LNNote[], edges: LNEdge[]): boolean {
  if (lns.length === 0) return true;
  const colsWithEdges = new Set<number>();
  for (const e of edges) {
    // Only count if both from and to are in this set
    if (lns.includes(e.from) && lns.includes(e.to)) {
      colsWithEdges.add(e.from.col);
      colsWithEdges.add(e.to.col);
    }
  }
  // All 4 columns must have at least one LN involved in a T→H edge
  return colsWithEdges.size === 4;
}

/** Check if a set of LNs involves ALL 4 columns in its T→H edges */
function spansAllColumns(lnSet: LNNote[], edges: LNEdge[]): boolean {
  const cols = new Set<number>();
  for (const e of edges) {
    if (lnSet.includes(e.from) && lnSet.includes(e.to)) {
      cols.add(e.from.col);
      cols.add(e.to.col);
    }
  }
  return cols.size === 4;
}

/**
 * Check if a set of LNs contains a T→H chain spanning all 4 columns.
 */
function hasFullSpanChain(lns: LNNote[], edges: LNEdge[]): boolean {
  const components = findComponents(lns, edges);
  return components.some(comp => spansAllColumns(comp, edges));
}

/**
 * Find the longest directed path in the T→H DAG.
 * "Longest" = largest time span (last.end - first.start).
 * Tiebreaker 1: more LN nodes (richer structure)
 * Tiebreaker 2: left-side column bias (lower average col)
 */
function findLongestPath(
  lns: LNNote[],
  edges: LNEdge[],
): LNNote[] {
  // Build adjacency: out-edges for each node
  const adj = new Map<LNNote, LNNote[]>();
  for (const ln of lns) adj.set(ln, []);
  for (const e of edges) {
    adj.get(e.from)!.push(e.to);
  }

  // Topological sort by start time (edges always go forward in time)
  const sorted = [...lns].sort((a, b) => a.start - b.start);
  const idx = new Map(sorted.map((ln, i) => [ln, i]));

  // DP tracking: for each node, best path ending here
  const dpDur = new Array<number>(sorted.length).fill(0);    // total time span
  const dpLen = new Array<number>(sorted.length).fill(1);    // node count
  const dpStart = new Array<number>(sorted.length).fill(0);  // path's first start time
  const dpPrev = new Array<number | null>(sorted.length).fill(null);
  const dpAvgCol = new Array<number>(sorted.length).fill(0); // avg column (tiebreak)

  for (let i = 0; i < sorted.length; i++) {
    const ln = sorted[i]!;
    // Base case: path of just this node
    dpDur[i] = ln.end - ln.start;
    dpStart[i] = ln.start;
    dpLen[i] = 1;
    dpAvgCol[i] = ln.col;

    for (const e of edges) {
      if (e.to === ln) {
        const pi = idx.get(e.from)!;
        // Extend predecessor's path
        const candDur = ln.end - dpStart[pi]!;        // new total span
        const candLen = dpLen[pi]! + 1;                // more nodes
        const candCol = (dpAvgCol[pi]! * dpLen[pi]! + ln.col) / candLen;

        // Better if: longer span, or same span but more nodes, or same but lefter
        if (candDur > dpDur[i]! ||
            (candDur === dpDur[i]! && candLen > dpLen[i]!) ||
            (candDur === dpDur[i]! && candLen === dpLen[i]! && candCol < dpAvgCol[i]!)) {
          dpDur[i] = candDur;
          dpLen[i] = candLen;
          dpStart[i] = dpStart[pi]!;
          dpPrev[i] = pi;
          dpAvgCol[i] = candCol;
        }
      }
    }
  }

  // Find best end node
  let bestEnd = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (dpDur[i]! > dpDur[bestEnd]! ||
        (dpDur[i]! === dpDur[bestEnd]! && dpLen[i]! > dpLen[bestEnd]!) ||
        (dpDur[i]! === dpDur[bestEnd]! && dpLen[i]! === dpLen[bestEnd]! && dpAvgCol[i]! < dpAvgCol[bestEnd]!)) {
      bestEnd = i;
    }
  }

  // Backtrack
  const path: LNNote[] = [];
  let curr: number | null = bestEnd;
  while (curr !== null) {
    path.unshift(sorted[curr]!);
    curr = dpPrev[curr];
  }
  return path;
}

/**
 * Check if all LNs in the measure participate in the T→H graph.
 * "No orphans" = every LN has at least 1 incoming or 1 outgoing edge.
 */
function noOrphans(lns: LNNote[], edges: LNEdge[]): boolean {
  if (lns.length === 0) return false;
  const connected = new Set<LNNote>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  return connected.size === lns.length;
}

/**
 * Compute strict ouroboros % — path-removal approach.
 *
 * Strict definition: remove the LONGEST directed T→H path from the graph.
 * If the remaining LNs either form nothing (empty) OR still contain a
 * 4-column-spanning ouroboros chain → the measure is strict ouroboros.
 *
 * Path priority:
 *   1. Longest path (most LN nodes)
 *   2. If tie, prefer paths biased to left-side columns (col 0-1)
 *   3. If only one path exists, remove it
 */
function strictOuroboros(lns: LNNote[]): number {
  if (lns.length < 2) return 0;

  const edges = buildEdges(lns);
  if (edges.length === 0) return 0;

  // Step 1: Must have a full-span chain to begin with
  const components = findComponents(lns, edges);
  const fullComps = components.filter(comp => spansAllColumns(comp, edges));
  if (fullComps.length === 0) return 0;

  // Step 2: Find and remove the longest path
  const longestPath = findLongestPath(lns, edges);
  const pathSet = new Set(longestPath);
  const remaining = lns.filter(ln => !pathSet.has(ln));

  // Step 3: If nothing left → ouroboros (removal left no notes)
  if (remaining.length === 0) {
    return (longestPath.length / lns.length) * 100;
  }

  // Step 4: Check if remaining LNs still have a full-span chain
  const remEdges = edges.filter(e => !pathSet.has(e.from) && !pathSet.has(e.to));
  if (!hasFullSpanChain(remaining, remEdges)) return 0;

  // Step 5: No partial components alongside (purity check)
  const remComps = findComponents(remaining, remEdges);
  for (const comp of remComps) {
    const compE = remEdges.filter(e => comp.includes(e.from) && comp.includes(e.to));
    if (compE.length > 0 && !spansAllColumns(comp, remEdges)) return 0;
  }

  // Score: all LNs in full-span components of the ORIGINAL graph
  let strictCount = 0;
  for (const comp of fullComps) {
    strictCount += comp.length;
  }
  return (strictCount / lns.length) * 100;
}

// ── Debug: detail one measure ──
function debugMeasure(
  lns: LNNote[],
  label: string,
): void {
  const edges = buildEdges(lns);
  const components = findComponents(lns, edges);

  console.log(`\n  ═══ ${label} ═══`);
  console.log(`    ${lns.length} LNs, ${edges.length} T→H edges`);

  if (lns.length === 0) return;

  // Show LNs per column with degree info
  for (let c = 0; c < 4; c++) {
    const colLns = lns.filter(ln => ln.col === c);
    if (colLns.length === 0) { console.log(`    C${c}: (none)`); continue; }
    const detail = colLns.map(ln => {
      const dur = ln.end - ln.start;
      const outs = edges.filter(e => e.from === ln);
      const ins  = edges.filter(e => e.to === ln);
      const outStr = outs.map(e => `→C${e.to.col}(+${e.gap}ms)`).join(",");
      const inStr  = ins.map(e => `C${e.from.col}→`).join(",");
      const deg = `out=${outs.length} in=${ins.length}`;
      return `${Math.round(ln.start)}ms(${Math.round(dur)}ms) ${deg}` + (outStr ? ` [${outStr}]` : "") + (inStr ? ` [${inStr}]` : "");
    }).join(" | ");
    console.log(`    C${c}: ${detail}`);
  }

  // Show components
  console.log(`    ${components.length} component(s):`);
  for (let i = 0; i < components.length; i++) {
    const comp = components[i]!;
    const cols = new Set(comp.map(ln => ln.col));
    const compEdges = edges.filter(e => comp.includes(e.from) && comp.includes(e.to));
    console.log(`      Comp${i + 1}: ${comp.length} LNs, cols=[${[...cols].sort().join(",")}], ${compEdges.length} internal edges`);
  }

  const curPct = currentOuroboros(lns);
  const strictPct = strictOuroboros(lns);

  // Show longest path info
  if (lns.length >= 2 && edges.length > 0) {
    const longest = findLongestPath(lns, edges);
    const pathSet = new Set(longest);
    const remaining = lns.filter(ln => !pathSet.has(ln));
    console.log(`    Longest path: ${longest.length} LNs, span=${(longest[longest.length-1]!.end - longest[0]!.start)}ms, cols=[${[...new Set(longest.map(ln => ln.col))].sort().join(",")}]`);
    console.log(`    Path: ${longest.map(ln => `C${ln.col}(${Math.round(ln.start)}ms,${Math.round(ln.end-ln.start)}ms)`).join(" → ")}`);
    if (remaining.length > 0) {
      const remEdges = edges.filter(e => !pathSet.has(e.from) && !pathSet.has(e.to));
      const remFull = hasFullSpanChain(remaining, remEdges);
      const remComps = findComponents(remaining, remEdges);
      console.log(`    Remaining: ${remaining.length} LNs, ${remFull ? "HAS full-span chain ✓" : "NO full-span chain ✗"}`);
      console.log(`    Remainder components:`);
      for (let i = 0; i < remComps.length; i++) {
        const comp = remComps[i]!;
        const compE = remEdges.filter(e => comp.includes(e.from) && comp.includes(e.to));
        const cols = [...new Set(comp.map(ln => ln.col))].sort();
        const hasOuroEdge = compE.length > 0;
        let desc: string;
        if (!hasOuroEdge) {
          desc = `orphan LNs (no T→H edges)`;
        } else if (cols.length === 4) {
          desc = `FULL ouroboros [${cols.join(",")}]`;
        } else if (cols.length === 3) {
          desc = `partial chain (3 cols) [${cols.join(",")}]`;
        } else {
          desc = `fragment (${cols.length} cols) [${cols.join(",")}]`;
        }
        console.log(`      Comp${i+1}: ${comp.length} LNs, ${compE.length} edges → ${desc}`);
        if (cols.length >= 1 && cols.length < 4 && comp.length <= 8) {
          for (const c of cols) {
            const colLns = comp.filter(ln => ln.col === c);
            if (colLns.length === 0) continue;
            const detail = colLns.map(ln => {
              const out = compE.filter(e => e.from === ln);
              const inp = compE.filter(e => e.to === ln);
              return `${Math.round(ln.start)}ms(${Math.round(ln.end-ln.start)}ms)` + (out.length ? ` →${out.map(e=>`C${e.to.col}`).join(",")}` : "") + (inp.length ? ` ${inp.map(e=>`C${e.from.col}`).join(",")}→` : "");
            }).join(" | ");
            console.log(`          C${c}: ${detail}`);
          }
        }
      }
    }
  }

  console.log(`    Current: ${curPct.toFixed(1)}%  |  Strict: ${strictPct.toFixed(1)}%  |  Status: ${strictPct >= 30 ? "Ouroboros ✓" : "NOT ouroboros"}${strictPct > 0 && strictPct < 30 ? " (below 30% threshold)" : ""}`);
}

// ── Main ──
function main() {
  const allFiles = fs.readdirSync(LN_MAPS_DIR).filter((f) => f.endsWith(".osu"));

  // Collect ALL LN measures for batch analysis
  let totalLNMeasures = 0;
  let currentOuroAbove30 = 0;
  let strictOuroAbove30 = 0;
  let bothAbove30 = 0;
  let currentOnly = 0;
  let strictOnly = 0;

  const downgradedMeasures: Array<{ file: string; mIdx: number; bpm: number; curPct: number; strictPct: number; lnCount: number }> = [];
  const upgradedMeasures: Array<{ file: string; mIdx: number; bpm: number; curPct: number; strictPct: number; lnCount: number }> = [];

  // Tree classification: all LNs participate in T→H but NOT strict ouroboros
  let treeMeasures = 0;
  const treeExamples: Array<{ file: string; mIdx: number; bpm: number; lnCount: number; cols: number }> = [];

  // Fallback subtype distribution for non-strict non-tree measures
  const fallbackSubtypes = new Map<string, number>();

  // Track per-stage stats
  const stageStats: Record<number, {
    maps: number;
    lnMeasures: number;
    currentOuro: number;
    strictOuro: number;
    downgraded: number;
    upgraded: number;
  }> = { 1: { maps: 0, lnMeasures: 0, currentOuro: 0, strictOuro: 0, downgraded: 0, upgraded: 0 },
       2: { maps: 0, lnMeasures: 0, currentOuro: 0, strictOuro: 0, downgraded: 0, upgraded: 0 },
       3: { maps: 0, lnMeasures: 0, currentOuro: 0, strictOuro: 0, downgraded: 0, upgraded: 0 },
       4: { maps: 0, lnMeasures: 0, currentOuro: 0, strictOuro: 0, downgraded: 0, upgraded: 0 } };

  const detailExamples: Array<{ file: string; mIdx: number; lns: LNNote[]; bpm: number; curPct: number; strictPct: number }> = [];
  const passExamples: Array<{ file: string; mIdx: number; lns: LNNote[]; bpm: number; curPct: number; strictPct: number }> = [];

  for (const stage of [1, 2, 3, 4]) {
    const stageFiles = allFiles.filter(f => f.includes(`Stage ${stage}`));
    stageStats[stage]!.maps = stageFiles.length;

    console.log(`\n${"=".repeat(110)}`);
    console.log(`  STAGE ${stage} — ${stageFiles.length} maps`);
    console.log(`${"=".repeat(110)}`);

    for (const file of stageFiles) {
      const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
      const parser = new OsuFileParser(osuText);
      parser.process();
      const beatmap = parser.getParsedData();
      const result = analyzeSections(beatmap);
      const bpm = beatmap.timingPoints.find(tp => tp.uninherited)
        ? Math.round(60000 / beatmap.timingPoints.find(tp => tp.uninherited)!.beatLength) : 0;

      const short = file.match(/\[(.+?)\]/)?.[1] ?? file;

      const lnMeasures = result.measures.filter(m => m.category === "ln" && m.lnMetrics);
      let mapDiff = false;

      for (const m of lnMeasures) {
        totalLNMeasures++;

        // Rebuild LN notes from the measure's time range
        const notes: LNNote[] = [];
        for (let i = 0; i < beatmap.noteStarts.length; i++) {
          const t = beatmap.noteStarts[i]!;
          if (t >= m.startTime && t < m.endTime && (beatmap.noteTypes[i]! & 128)) {
            notes.push({
              col: beatmap.columns[i]!,
              start: t,
              end: beatmap.noteEnds[i]!,
              isLN: true,
            });
          }
        }

        if (notes.length < 2) continue;

        const curPct = currentOuroboros(notes);
        const strictPct = strictOuroboros(notes);

        const curAbove30 = curPct >= 30;
        const strictAbove30 = strictPct >= 30;

        if (curAbove30) currentOuroAbove30++;
        if (strictAbove30) strictOuroAbove30++;
        if (curAbove30 && strictAbove30) bothAbove30++;
        if (curAbove30 && !strictAbove30) {
          currentOnly++;
          downgradedMeasures.push({ file: short, mIdx: m.index + 1, bpm, curPct, strictPct, lnCount: notes.length });
          stageStats[stage]!.downgraded++;
          if (!mapDiff) { mapDiff = true; }
        }
        if (!curAbove30 && strictAbove30) {
          strictOnly++;
          upgradedMeasures.push({ file: short, mIdx: m.index + 1, bpm, curPct, strictPct, lnCount: notes.length });
          stageStats[stage]!.upgraded++;
          if (!mapDiff) { mapDiff = true; }
        }

        // Tree: all LNs have edges but NOT strict ouroboros
        if (strictPct < 30) {
          const allEdges = buildEdges(notes);
          if (noOrphans(notes, allEdges)) {
            treeMeasures++;
            const coverCols = [...new Set(notes.map(n => n.col))];
            if (treeExamples.length < 10) {
              treeExamples.push({ file: short, mIdx: m.index + 1, bpm, lnCount: notes.length, cols: coverCols.length });
            }
            if (treeExamples.length <= 3) {
              detailExamples.push({ file: short, mIdx: m.index + 1, lns: notes, bpm, curPct, strictPct });
            }
          } else {
            // Has orphans → fall back to existing LN subtype
            const subtype = m.lnSubtype ?? "null";
            fallbackSubtypes.set(subtype, (fallbackSubtypes.get(subtype) ?? 0) + 1);
          }
        }

        stageStats[stage]!.lnMeasures++;
        if (curAbove30) stageStats[stage]!.currentOuro++;
        if (strictAbove30) stageStats[stage]!.strictOuro++;

        // Collect examples for detailed debug (max 6)
        if (downgradedMeasures.length <= 10 && curAbove30 && !strictAbove30) {
          detailExamples.push({ file: short, mIdx: m.index + 1, lns: notes, bpm, curPct, strictPct });
        }
        if (passExamples.length < 5 && curAbove30 && strictAbove30) {
          passExamples.push({ file: short, mIdx: m.index + 1, lns: notes, bpm, curPct, strictPct });
        }
      }

      // Per-map summary (only if changes)
      if (mapDiff) {
        const mapDown = downgradedMeasures.filter(d => d.file === short).length;
        const mapUp = upgradedMeasures.filter(d => d.file === short).length;
        const lnTotalOnMap = lnMeasures.length;
        console.log(`  ${short.padEnd(30)} @${bpm}BPM  LN msr:${lnTotalOnMap}  ↓${mapDown} ↑${mapUp}`);
      }
    }
  }

  // ── Summary ──
  console.log(`\n\n${"█".repeat(110)}`);
  console.log(`  SUMMARY — All 4 Stages (64 maps, ${totalLNMeasures} LN measures)`);
  console.log(`${"█".repeat(110)}`);

  console.log(`\n  Threshold: ouroboros ≥ 30%`);
  console.log(`  Current ouroboros (≥30%):  ${currentOuroAbove30}/${totalLNMeasures} measures`);
  console.log(`  Strict  ouroboros (≥30%):  ${strictOuroAbove30}/${totalLNMeasures} measures`);
  console.log(`  Both agree:                ${bothAbove30} measures`);
  console.log(`  ↓ Downgraded (current yes, strict no): ${currentOnly} measures`);
  console.log(`  ↑ Upgraded   (current no,  strict yes): ${strictOnly} measures`);
  console.log(`  🌲 Tree (all LNs connected, but NOT strict ouroboros): ${treeMeasures} measures`);

  // Fallback subtype distribution
  const nonStrictNonTree = 4953 - bothAbove30 - treeMeasures;
  const sortedFallback = [...fallbackSubtypes.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n  ── Fallback: non-strict, non-tree (${nonStrictNonTree} measures) → existing LN subtypes ──`);
  let accounted = 0;
  for (const [subtype, count] of sortedFallback) {
    accounted += count;
    const pct = (count / Math.max(1, nonStrictNonTree) * 100).toFixed(0);
    console.log(`    ${subtype.padEnd(16)} ${String(count).padStart(5)}  (${pct}%)`);
  }
  console.log(`    ${"---".padEnd(16)} ${"-----"}`);
  console.log(`    ${"total accounted".padEnd(16)} ${String(accounted).padStart(5)}`);

  console.log(`\n  Per-Stage Breakdown:`);

  console.log(`\n  Per-Stage Breakdown:`);
  console.log(`  ${"Stage".padEnd(8)} ${"Maps".padEnd(6)} ${"LN Msr".padEnd(8)} ${"Cur Oro".padEnd(9)} ${"Str Oro".padEnd(9)} ${"↓Down".padEnd(7)} ${"↑Up".padEnd(7)}`);
  console.log(`  ${"-".repeat(55)}`);
  for (const stage of [1, 2, 3, 4]) {
    const s = stageStats[stage]!;
    console.log(`  ${`Stage ${stage}`.padEnd(8)} ${String(s.maps).padEnd(6)} ${String(s.lnMeasures).padEnd(8)} ${String(s.currentOuro).padEnd(9)} ${String(s.strictOuro).padEnd(9)} ${String(s.downgraded).padEnd(7)} ${String(s.upgraded).padEnd(7)}`);
  }

  // ── Show ALL passing strict measures ──
  const passResults: Array<{ file: string; mIdx: number; bpm: number; curPct: number; strictPct: number; lnCount: number; stage: number }> = [];
  for (const stage of [1, 2, 3, 4]) {
    const stageFiles = allFiles.filter(f => f.includes(`Stage ${stage}`));
    for (const file of stageFiles) {
      const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
      const parser = new OsuFileParser(osuText);
      parser.process();
      const beatmap = parser.getParsedData();
      const result = analyzeSections(beatmap);
      const bpm = beatmap.timingPoints.find(tp => tp.uninherited)
        ? Math.round(60000 / beatmap.timingPoints.find(tp => tp.uninherited)!.beatLength) : 0;
      const short = file.match(/\[(.+?)\]/)?.[1] ?? file;

      for (const m of result.measures.filter(m => m.category === "ln" && m.lnMetrics)) {
        const notes: LNNote[] = [];
        for (let i = 0; i < beatmap.noteStarts.length; i++) {
          const t = beatmap.noteStarts[i]!;
          if (t >= m.startTime && t < m.endTime && (beatmap.noteTypes[i]! & 128)) {
            notes.push({ col: beatmap.columns[i]!, start: t, end: beatmap.noteEnds[i]!, isLN: true });
          }
        }
        if (notes.length < 2) continue;
        const curPct = currentOuroboros(notes);
        const strictPct = strictOuroboros(notes);
        if (curPct >= 30 && strictPct >= 30) {
          passResults.push({ file: short, mIdx: m.index + 1, bpm, curPct, strictPct, lnCount: notes.length, stage });
        }
      }
    }
  }

  // Sort by LN count ascending (simpler first)
  passResults.sort((a, b) => a.lnCount - b.lnCount);

  console.log(`\n\n${"█".repeat(110)}`);
  console.log(`  ALL ${passResults.length} STRICT-PASSING MEASURES (sorted by LN count, simpler first)`);
  console.log(`${"█".repeat(110)}`);
  console.log(`  ${"Stage".padEnd(7)} ${"Map".padEnd(32)} ${"Msr".padEnd(5)} ${"BPM".padEnd(5)} ${"LNs".padEnd(5)} ${"Cur%".padEnd(6)} ${"Str%".padEnd(6)}`);
  console.log(`  ${"-".repeat(75)}`);

  for (const p of passResults) {
    console.log(`  Stg ${p.stage}  ${p.file.padEnd(32)} M${String(p.mIdx).padStart(3)}  ${String(p.bpm).padEnd(5)} ${String(p.lnCount).padEnd(5)} ${p.curPct.toFixed(0).padEnd(6)} ${p.strictPct.toFixed(0).padEnd(6)}`);
  }
  if (downgradedMeasures.length > 0) {
    console.log(`\n\n  ── ↓ Downgraded Examples (current=yes, strict=no) ──`);
    console.log(`  ${downgradedMeasures.length} total, showing first 15:`);
    for (const d of downgradedMeasures.slice(0, 15)) {
      console.log(`    ${d.file.padEnd(30)} M${String(d.mIdx).padStart(3)} @${d.bpm}BPM | cur:${d.curPct.toFixed(0)}% → strict:${d.strictPct.toFixed(0)}% | ${d.lnCount} LNs`);
    }
  }

  if (upgradedMeasures.length > 0) {
    console.log(`\n\n  ── ↑ Upgraded Examples (current=no, strict=yes) ──`);
    console.log(`  ${upgradedMeasures.length} total:`);
    for (const u of upgradedMeasures.slice(0, 15)) {
      console.log(`    ${u.file.padEnd(30)} M${String(u.mIdx).padStart(3)} @${u.bpm}BPM | cur:${u.curPct.toFixed(0)}% → strict:${u.strictPct.toFixed(0)}% | ${u.lnCount} LNs`);
    }
  }

  if (treeExamples.length > 0) {
    console.log(`\n\n  ── 🌲 Tree Examples (no orphans, but NOT strict ouroboros) ──`);
    for (const t of treeExamples) {
      console.log(`    ${t.file.padEnd(30)} M${String(t.mIdx).padStart(3)} @${t.bpm}BPM | ${t.lnCount} LNs, ${t.cols}/4 cols`);
    }
  }

  // ── Debug detail on selected measures ──
  console.log(`\n\n  ── DEBUG: Downgraded examples ──`);
  for (const ex of detailExamples.slice(0, 6)) {
    debugMeasure(ex.lns, `${ex.file} M${ex.mIdx} @${ex.bpm}BPM (cur=${ex.curPct.toFixed(0)}% strict=${ex.strictPct.toFixed(0)}%)`);
  }

  if (passExamples.length > 0) {
    console.log(`\n\n  ── DEBUG: Strict-passing examples ──`);
    for (const ex of passExamples.slice(0, 3)) {
      debugMeasure(ex.lns, `${ex.file} M${ex.mIdx} @${ex.bpm}BPM (cur=${ex.curPct.toFixed(0)}% strict=${ex.strictPct.toFixed(0)}%)`);
    }
  }
}

main();
