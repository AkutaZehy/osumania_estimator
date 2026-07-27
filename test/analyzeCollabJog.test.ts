import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeSections } from "../src/custom/sectionAnalysis.js";
import { buildEdges, findComponents, findLongestPath, hasFullSpanChain } from "../test/strictOuroboros.test.js";

// Can't import from test directly, so redefine inline
type LNNote = { col: number; start: number; end: number };
interface LNEdge { from: LNNote; to: LNNote }

function _buildEdges(lns: LNNote[]): LNEdge[] {
  const edges: LNEdge[] = [];
  for (let i = 0; i < lns.length; i++)
    for (let j = 0; j < lns.length; j++) { if (i === j) continue; const gap = lns[j]!.start - lns[i]!.end; if (gap >= 0 && gap < 21) edges.push({ from: lns[i]!, to: lns[j]! }); }
  return edges;
}

function _findComponents(lns: LNNote[], edges: LNEdge[]): LNNote[][] {
  const idx = new Map(lns.map((ln, i) => [ln, i]));
  const adj: number[][] = Array.from({ length: lns.length }, () => []);
  for (const e of edges) { const fi = idx.get(e.from)!, ti = idx.get(e.to)!; adj[fi]!.push(ti); adj[ti]!.push(fi); }
  const vis = new Array(lns.length).fill(false), comps: LNNote[][] = [];
  for (let i = 0; i < lns.length; i++) { if (vis[i]) continue; const c: LNNote[] = []; const s = [i]; vis[i] = true; while (s.length) { const v = s.pop()!; c.push(lns[v]!); for (const nb of adj[v]!) if (!vis[nb]) { vis[nb] = true; s.push(nb); } } comps.push(c); }
  return comps;
}

function _spansAll(lnSet: LNNote[], edges: LNEdge[]): boolean {
  const cols = new Set<number>(); for (const e of edges) { if (lnSet.includes(e.from) && lnSet.includes(e.to)) { cols.add(e.from.col); cols.add(e.to.col); } } return cols.size === 4;
}

function _hasFullSpan(lns: LNNote[], edges: LNEdge[]): boolean { return _findComponents(lns, edges).some(c => _spansAll(c, edges)); }

function _findLongestPath(lns: LNNote[], edges: LNEdge[]): LNNote[] {
  const adj = new Map<LNNote, LNNote[]>(); for (const ln of lns) adj.set(ln, []); for (const e of edges) adj.get(e.from)!.push(e.to);
  const sorted = [...lns].sort((a, b) => a.start - b.start), idx = new Map(sorted.map((ln, i) => [ln, i]));
  const dpDur = new Array(sorted.length).fill(0), dpLen = new Array(sorted.length).fill(1), dpStart = new Array(sorted.length).fill(0), dpPrev = new Array<number | null>(sorted.length).fill(null), dpCol = new Array(sorted.length).fill(0);
  for (let i = 0; i < sorted.length; i++) { const ln = sorted[i]!; dpDur[i] = ln.end - ln.start; dpStart[i] = ln.start; dpCol[i] = ln.col;
    for (const e of edges) { if (e.to === ln) { const pi = idx.get(e.from)!; const cd = ln.end - dpStart[pi]!, cl = dpLen[pi]! + 1, cc = (dpCol[pi]! * dpLen[pi]! + ln.col) / cl;
      if (cd > dpDur[i]! || (cd === dpDur[i]! && cl > dpLen[i]!) || (cd === dpDur[i]! && cl === dpLen[i]! && cc < dpCol[i]!)) { dpDur[i] = cd; dpLen[i] = cl; dpStart[i] = dpStart[pi]!; dpPrev[i] = pi; dpCol[i] = cc; } } } }
  let be = 0; for (let i = 1; i < sorted.length; i++) { if (dpDur[i]! > dpDur[be]! || (dpDur[i]! === dpDur[be]! && dpLen[i]! > dpLen[be]!) || (dpDur[i]! === dpDur[be]! && dpLen[i]! === dpLen[be]! && dpCol[i]! < dpCol[be]!)) be = i; }
  const path: LNNote[] = []; let curr: number | null = be; while (curr !== null) { path.unshift(sorted[curr]!); curr = dpPrev[curr]; } return path;
}

function strictOuroboros(lns: LNNote[]): number {
  if (lns.length < 2) return 0; const edges = _buildEdges(lns); if (edges.length === 0) return 0;
  const comps = _findComponents(lns, edges); const full = comps.filter(c => _spansAll(c, edges)); if (full.length === 0) return 0;
  const path = _findLongestPath(lns, edges); const ps = new Set(path); const rem = lns.filter(ln => !ps.has(ln));
  if (rem.length === 0) { let cnt = 0; for (const c of full) cnt += c.length; return (cnt / lns.length) * 100; }
  const re = edges.filter(e => !ps.has(e.from) && !ps.has(e.to)); if (!_hasFullSpan(rem, re)) return 0;
  const rc = _findComponents(rem, re); for (const c of rc) { const ce = re.filter(e => c.includes(e.from) && c.includes(e.to)); if (ce.length > 0 && !_spansAll(c, re)) return 0; }
  let cnt = 0; for (const c of full) cnt += c.length; return (cnt / lns.length) * 100;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.resolve(__dirname, "../maps/Hitori Tori - perthed again (yambabom remix) (TheToaphster) [Advanced].osu");
const osuText = fs.readFileSync(file, "utf-8");
const parser = new OsuFileParser(osuText); parser.process();
const beatmap = parser.getParsedData();
const result = analyzeSections(beatmap);

// Show BPM zones quick
const tps = beatmap.timingPoints.filter(t => t.uninherited);
console.log("SV timing points: " + tps.length);
for (const tp of tps.slice(0, 10)) {
  console.log(`  t=${tp.time}ms beatLength=${tp.beatLength.toFixed(1)} BPM=${(60000/tp.beatLength).toFixed(0)}`);
}

console.log("\n=== Section Analysis ===");
console.log("Duration: " + (beatmap.duration/1000).toFixed(0) + "s, LN: " + (beatmap.lnRatio*100).toFixed(0) + "%");

// Show segments with LN subtypes
let segIdx = 0;
for (const seg of result.segments) {
  const t0 = (seg.startTime/1000).toFixed(1), t1 = (seg.endTime/1000).toFixed(1);
  if (seg.category === "ln") {
    const subtypes: Record<string, number> = {};
    for (const m of seg.measures) {
      const st = m.lnSubtype ?? "null"; subtypes[st] = (subtypes[st] ?? 0) + 1;
    }
    const stStr = Object.entries(subtypes).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}:${v}`).join(" ");
    console.log(`  S${segIdx} [${t0}s-${t1}s] LN ${seg.measures.length}msr → ${stStr}`);
    
    // For each LN measure, show T→H graph details
    for (const m of seg.measures.slice(0, 3)) {
      const lns: LNNote[] = [];
      for (let i = 0; i < beatmap.noteStarts.length; i++) {
        const t = beatmap.noteStarts[i]!;
        if (t >= m.startTime && t < m.endTime && (beatmap.noteTypes[i]! & 128)) {
          lns.push({ col: beatmap.columns[i]!, start: t, end: beatmap.noteEnds[i]! });
        }
      }
      if (lns.length < 2) continue;
      const edges = _buildEdges(lns);
      const strOuro = strictOuroboros(lns);
      const allConn = edges.length > 0 && (() => { const c = new Set<LNNote>(); for (const e of edges) { c.add(e.from); c.add(e.to); } return c.size === lns.length; })();
      const pctConn = edges.length > 0 ? (() => { const c = new Set<LNNote>(); for (const e of edges) { c.add(e.from); c.add(e.to); } return c.size / lns.length; })() : 0;
      const longest = _findLongestPath(lns, edges);
      
      // Show degree info
      const outDeg: Record<number, number> = {}, inDeg: Record<number, number> = {};
      for (const e of edges) { outDeg[e.from.col] = (outDeg[e.from.col] ?? 0) + 1; inDeg[e.to.col] = (inDeg[e.to.col] ?? 0) + 1; }
      const degDetail = [...new Set(lns.map(l => l.col))].sort().map(c => `C${c}:out${outDeg[c]??0}/in${inDeg[c]??0}`).join(" ");
      
      console.log(`    M${m.index+1} [${(m.startTime/1000).toFixed(1)}s] ${lns.length}LNs edges=${edges.length} strict=${strOuro.toFixed(0)}% ${allConn?"ALL-CONN":`conn=${(pctConn*100).toFixed(0)}%`} degs=[${degDetail}] subtype=${m.lnSubtype}`);
    }
  }
  segIdx++;
}
