// ============================================================
// Strict Ouroboros helpers (v3.1.0 path-removal resilience)
// ============================================================
// Single shared implementation for gridAnalysis cell metrics and
// sectionAnalysis segment metrics — previously a verbatim twin in both
// files that had already started to drift.

import { lowerBound } from "../../utils/beatmapUtils.js";

export type LNNote = { col: number; start: number; end: number };

export interface LNEdge { from: LNNote; to: LNNote }

export function buildEdges(lns: LNNote[]): LNEdge[] {
  if (lns.length < 2) return [];
  // Sort by start time for binary search (O(k log k) instead of O(k²))
  const sorted = [...lns].sort((a, b) => a.start - b.start);
  const starts = sorted.map(l => l.start);
  const edges: LNEdge[] = [];
  for (const ln of lns) {
    const lo = lowerBound(starts, ln.end);
    const hi = lowerBound(starts, ln.end + 21);
    for (let i = lo; i < hi; i++) {
      const target = sorted[i]!;
      if (target !== ln) edges.push({ from: ln, to: target });
    }
  }
  return edges;
}

export function maxBipartiteMatch(n: number, adj: number[][]): number[] {
  const matchR = new Array(n).fill(-1);
  const dfs = (u: number, visited: boolean[]): boolean => {
    for (const v of adj[u]!) {
      if (visited[v]) continue;
      visited[v] = true;
      if (matchR[v] === -1 || dfs(matchR[v]!, visited)) { matchR[v] = u; return true; }
    }
    return false;
  };
  for (let u = 0; u < n; u++) { const visited = new Array(n).fill(false); dfs(u, visited); }
  return matchR;
}

/**
 * Strict Ouroboros on a single measure window.
 * Returns 100 if the window's LNs form vertex-disjoint chains (path cover) with
 * no orphan LNs, after exempting "base" LNs (long orphans covering the window).
 * Returns 0 otherwise (shared paths / tree / orphan structure).
 */
export function computeStrictOuroboros(lns: LNNote[], windowMs: number): number {
  if (lns.length < 2) return 0;
  const edges = buildEdges(lns);
  const inn = new Set<LNNote>(); const outn = new Set<LNNote>();
  for (const e of edges) { inn.add(e.to); outn.add(e.from); }
  // Exempt long base LNs: orphans covering ≥75% of the window don't break chains
  const exempt = new Set(lns.filter(l => !inn.has(l) && !outn.has(l) && (l.end - l.start) >= windowMs * 0.75));
  const active = lns.filter(l => !exempt.has(l));
  if (active.length < 2) return 0;
  const idx = new Map<LNNote, number>(); active.forEach((l, i) => idx.set(l, i));
  const aEdges = edges.filter(e => idx.has(e.from) && idx.has(e.to));
  const aIn = new Set<LNNote>(); const aOut = new Set<LNNote>();
  for (const e of aEdges) { aIn.add(e.to); aOut.add(e.from); }
  if (active.some(l => !aIn.has(l) && !aOut.has(l))) return 0;
  const outAdj: number[][] = Array.from({ length: active.length }, () => []);
  for (const e of aEdges) outAdj[idx.get(e.from)!]!.push(idx.get(e.to)!);
  const matchR = maxBipartiteMatch(active.length, outAdj);
  const ho = new Array(active.length).fill(false), hi = new Array(active.length).fill(false);
  for (let v = 0; v < active.length; v++) if (matchR[v] !== -1) { ho[matchR[v]!] = true; hi[v] = true; }
  let covered = 0;
  for (let i = 0; i < active.length; i++) if (ho[i] || hi[i]) covered++;
  return covered === active.length ? 100 : 0;
}
