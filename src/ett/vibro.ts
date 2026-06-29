// ============================================================
// Etterna MinaCalc wrapper — JackSpeed vibro detection
// Uses window.MinacalcModule loaded by <script type="module"> in index.html
// ============================================================

import { OsuFileParser } from "../parser/osuFileParser.js";

declare global { interface Window { MinacalcModule?: () => Promise<any> } }

export async function isVibroMap(osuText: string): Promise<boolean> {
  try {
    const init = window.MinacalcModule;
    if (!init) return false;

    const p = new OsuFileParser(osuText); p.process();
    const d = p.getParsedData();
    if (d.columnCount !== 4) return false;

    const tm = new Map<number, number>();
    for (let i = 0; i < d.columns.length; i++) {
      const c = d.columns[i]!, t = d.noteStarts[i]!;
      tm.set(t, (tm.get(t) ?? 0) | (1 << c));
      if ((d.noteTypes[i]! & 128) !== 0 && d.noteEnds[i]! > t) {
        tm.set(d.noteEnds[i]!, (tm.get(d.noteEnds[i]!) ?? 0) | (1 << c));
      }
    }
    const s = [...tm.entries()].sort((a, b) => a[0] - b[0]);
    const n = s.length; if (!n) return false;

    const m = await init();
    const mp = m._malloc(n * 4), tp = m._malloc(n * 4), op = m._malloc(32);
    const mh = new Uint32Array(m.HEAPU8.buffer, mp, n);
    const th = new Float32Array(m.HEAPU8.buffer, tp, n);
    for (let i = 0; i < n; i++) { mh[i] = s[i]![1]!; th[i] = s[i]![0]! / 1000; }

    const ok = m._minacalc_compute(4, 1.0, 0.93, mp, tp, n, op);
    const oh = new Float32Array(m.HEAPU8.buffer, op, 8);
    const js = oh[5]!, ov = oh[0]!;
    m._free(mp); m._free(tp); m._free(op);
    return ov > 0 && js / ov >= 0.95;
  } catch { return false; }
}
