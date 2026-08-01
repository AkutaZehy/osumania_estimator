// ============================================================
// features.ts — Full feature extraction for model fitting.
// Scans calib/maps/ + calib/bench-maps/, runs the pipeline twice
// per map (original + LN→rice conversion), emits
//   calib/features.json
//
// Run: npm run calib:features
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";
import type { DifficultyResult } from "../../src/types/result.js";

const CALIB_DIR = resolve("calib");
const OUT_PATH = join(CALIB_DIR, "features.json");

function collectOsuFiles(dir: string): string[] {
  let out: string[] = [];
  try { for (const entry of readdirSync(dir)) { const full = join(dir, entry); if (statSync(full).isDirectory()) out = out.concat(collectOsuFiles(full)); else if (entry.toLowerCase().endsWith(".osu")) out.push(full); } } catch { }
  return out;
}

function md5Of(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

/** Strip LN heads: type &= ~128, drop tail param. Output keeps everything else. */
function lnToRice(text: string): string {
  const hoIdx = text.indexOf("[HitObjects]");
  if (hoIdx < 0) return text;
  const head = text.slice(0, hoIdx);
  const rest = text.slice(hoIdx);
  const out: string[] = [];
  for (const line of rest.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("//")) {
      const parts = line.split(",");
      if (parts.length >= 5 && /^\d+$/.test(parts[0]!) && /^\d+$/.test(parts[1]!) && /^\d+$/.test(parts[2]!)) {
        const type = Number(parts[3]!) & ~128;
        out.push(`${parts.slice(0, 3).join(",")},${type},${parts.slice(4, 5).join(",")}`);
        continue;
      }
    }
    out.push(line);
  }
  return head + out.join("\n");
}

// grade strings → numeric rank (kept for reference; raw grade shares are emitted)
function gradeRank(g: string | null): number {
  if (!g) return 0;
  if (g.includes("Dense")) return 4;
  if (g.includes("Mid")) return 3;
  if (g.includes("Low")) return 2;
  if (g.includes("Mini")) return 1;
  return 0;
}

/** Parse "24×8 16×12" → { t16: number, t24: number } (counts × density weight) */
function parseTrills(s: string): { t16: number; t24: number } {
  let t16 = 0, t24 = 0;
  for (const part of s.split(/\s+/)) {
    const m = part.match(/^(\d+)×(\d+)$/);
    if (!m) continue;
    const d = Number(m[1]), n = Number(m[2]);
    if (d === 16) t16 += n;
    else if (d === 24) t24 += n;
  }
  return { t16, t24 };
}

function collectFeatures(r: DifficultyResult, file: string): Record<string, unknown> {
  const c = r.custom;
  const ga = r.gridAnalysis;
  const ln = c.ln;
  const trills = parseTrills(c.tech.rollTrill.trills);
  const pools: Record<string, number> = {
    coordination: ln.coordinationPoolScore,
    density: ln.densityPoolScore,
    wildcard: ln.wildcardPoolScore,
    technical: ln.technicalPoolScore,
  };
  const mainPool = (Object.entries(pools).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ?? "none");
  const totalCells = ga && ga.cells.length > 0 ? ga.cells.filter((cell) => cell.category !== "break").length : 0;
  const share = (cat: string): number => {
    if (!ga || totalCells === 0) return 0;
    let cells = 0;
    for (const seg of ga.segments) if (seg.category === cat) cells += seg.cells.length;
    return cells / totalCells;
  };
  const gradeShare = (cat: string): Record<string, number> => {
    const out: Record<string, number> = {};
    if (!ga || totalCells === 0) return out;
    for (const seg of ga.segments) {
      if (seg.category !== cat) continue;
      const grade = seg.grade.split(" ")[0]!;
      out[grade] = (out[grade] ?? 0) + seg.cells.length;
    }
    for (const k of Object.keys(out)) out[k] = out[k]! / totalCells;
    return out;
  };
  // raw density numbers inside the grade string "Low (7/3.5)" or "Single (0.99)" → { max, med }
  const gradeNums = (cat: string): { maxW: number; maxPeak: number; medW: number } => {
    let maxW = 0, medW = 0, maxPeak = 0, cells = 0;
    if (ga) {
      for (const seg of ga.segments) {
        if (seg.category !== cat || seg.cells.length === 0) continue;
        const m = seg.grade.match(/\((\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\)/);
        if (!m) continue;
        const mx = Number(m[1]), md = m[2] != null ? Number(m[2]) : mx;
        maxW += mx * seg.cells.length;
        medW += md * seg.cells.length;
        cells += seg.cells.length;
        if (mx > maxPeak) maxPeak = mx;
      }
    }
    return cells > 0 ? { maxW: maxW / cells, maxPeak, medW: medW / cells } : { maxW: 0, maxPeak: 0, medW: 0 };
  };
  const durationSec = ga && ga.cells.length > 0
    ? Math.round((ga.cells[ga.cells.length - 1]!.endTime - ga.cells[0]!.startTime) / 1000)
    : 0;
  const highestBpm = (cat: string): number => {
    if (!ga) return 0;
    let best = 0;
    for (const seg of ga.segments) if (seg.category === cat && seg.effectiveBPM > best) best = seg.effectiveBPM;
    return best;
  };
  return {
    file,
    sunny: r.sunny.star,
    bpm: r.meta.bpm,
    lnRatio: r.meta.lnRatio ?? 0,
    durationSec,
    // jack features
    jackShare: share("jack"),
    jackGrade: gradeShare("jack"),
    ...gradeNums("jack").maxW === 0 ? {} : { jackMaxW: gradeNums("jack").maxW, jackMaxPeak: gradeNums("jack").maxPeak, jackMedW: gradeNums("jack").medW },
    jackAnchorCount: c.jack.anchorCount,
    jackSfp: c.jack.singleFingerPressure,
    jackShp: c.jack.singleHandPressure,
    jackImbalance: c.jack.imbalanceTotal,
    jackHandBias: c.jack.handBias === "L" || c.jack.handBias === "R" ? 1 : 0,
    jackIsBias: c.jack.isBias ? 1 : 0,
    jackBpm: highestBpm("jack"),
    // stream features
    streamShare: share("stream"),
    streamIsHandstream: c.stream.streamType?.includes("HandStream") ? 1 : 0,
    streamGrade: gradeShare("stream"),
    ...gradeNums("stream").maxW === 0 ? {} : { streamMaxW: gradeNums("stream").maxW, streamMaxPeak: gradeNums("stream").maxPeak, streamMedW: gradeNums("stream").medW },
    streamBrokenMax: c.stream.brokenMax,
    streamBpm: highestBpm("stream"),
    // tech features
    techGrace: c.tech.graceCount,
    techSfkps: c.tech.burst.singleFingerKPS,
    techOhkps: c.tech.burst.oneHandKPS,
    techBhkps: c.tech.burst.bothHandsKPS,
    techTrills16: trills.t16,
    techTrills24: trills.t24,
    // stamina features
    staminaMedDensity: c.stamina.medDensity,
    staminaMedDuration: c.stamina.medDuration,
    staminaMedTotal: c.stamina.medTotalTime,
    staminaStretchRatio: c.stamina.stretchRatio,
    staminaSwitchFreq: c.stamina.switchFrequency,
    // anchor features
    anchorSfP50: c.anchor.sf.p50,
    anchorShP50: c.anchor.sh.p50,
    anchorDhP50: c.anchor.dh.p50,
    anchorSfBpm: c.anchor.sfBPM,
    anchorShBpm: c.anchor.shBPM,
    // LN features (original chart only; rice chart has zeros)
    strictLNRatio: ln.strictLNRatio,
    releaseDifficulty: ln.releaseDifficulty,
    lnShield: ln.shieldCount,
    lnInverse: ln.inverseCount,
    lnColumnLock: ln.columnLockCount,
    lnOverlay: ln.overlayCount,
    lnAsyncRelease: ln.asyncReleaseCount,
    lnRelease: ln.releaseCount,
    lnChord: ln.lnChordCount,
    lnStream: ln.lnStreamCount,
    lnWcJack: ln.wcJackCount,
    lnWcSpeed: ln.wcSpeedCount,
    pools,
    mainPool,
  };
}

interface BenchRow { name: string; pattern: string; expected: number }

function readBenchRows(): Map<string, BenchRow> {
  const map = new Map<string, BenchRow>();
  const lines = readFileSync(join(CALIB_DIR, "bench-maps", "file.csv"), "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^(?:[0-9]*,)?(.*?),(tech|stamina|speed|jack|ln),([^,]*),([^,]*),/);
    if (!m) continue;
    const expected = parseFloat(m[4]!);
    if (!Number.isFinite(expected)) continue;
    const name = m[1]!.replace(/^,/, "").trim();
    if (!name) continue;
    map.set(name, { name, pattern: m[2]!, expected });
  }
  return map;
}

async function main(): Promise<void> {
  const bench = readBenchRows();
  const out: Array<Record<string, unknown>> = [];
  let failed = 0;
  let riceFailed = 0;

  const batches: Array<{ file: string; bench: BenchRow | null }> = [];
  for (const file of collectOsuFiles(join(CALIB_DIR, "maps"))) batches.push({ file, bench: null });
  for (const file of collectOsuFiles(join(CALIB_DIR, "bench-maps"))) {
    const row = bench.get(basename(file, ".osu").trim());
    if (row) batches.push({ file, bench: row });
  }

  for (let i = 0; i < batches.length; i++) {
    const { file, bench: row } = batches[i]!;
    try {
      const text = readFileSync(file, "utf-8");
      const result = analyzeBeatmap(text);
      const feats = collectFeatures(result, file);
      const md5 = md5Of(text);
      feats.md5 = md5;
      if (row) {
        feats.pattern = row.pattern;
        feats.expected = row.expected;
        feats.name = row.name;
      } else {
        feats.pattern = "user";
        feats.expected = null;
      }
      // rice conversion (only when LN present, cheap skip otherwise)
      const riceText = lnToRice(text);
      if (riceText !== text) {
        try {
          const rice = analyzeBeatmap(riceText);
          feats.sunnyRice = rice.sunny.star;
          feats.rcJackShare = collectFeatures(rice, file).jackShare;
        } catch { riceFailed++; feats.sunnyRice = null; }
      } else {
        feats.sunnyRice = result.sunny.star;
      }
      out.push(feats);
      if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${batches.length}`);
    } catch (err) {
      failed++;
      console.log(`  [fail] ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  mkdirSync(CALIB_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));
  console.log(`[features] wrote ${OUT_PATH} (${out.length} maps, ${failed} failed, ${riceFailed} rice failed)`);
}

await main();
