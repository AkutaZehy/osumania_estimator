// ============================================================
// scan.ts — Scan calib/maps/ → run full pipeline → emit
//   calib/scan.json  (everything the labeler needs to show)
//
// Run: npm run calib:scan
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";
import { estimateDifficulty } from "../../src/estimate.js";

const CALIB_DIR = resolve("calib");
const MAPS_DIR = join(CALIB_DIR, "maps");
const OUT_PATH = join(CALIB_DIR, "scan.json");

function collectOsuFiles(dir: string): string[] {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectOsuFiles(full));
    else if (entry.toLowerCase().endsWith(".osu")) out.push(full);
  }
  return out;
}

function exists(p: string): boolean {
  try { statSync(p); return true; } catch { return false; }
}

function md5Of(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

// BeatmapID / BeatmapSetID live in the [Metadata] section of .osu files.
function parseBeatmapIds(text: string): { beatmapId: number; setId: number } {
  let beatmapId = 0;
  let setId = 0;
  const metaMatch = text.match(/\[Metadata\]([\s\S]*?)(?=\[[A-Za-z]+\])/);
  const section = metaMatch?.[1] ?? "";
  const m1 = section.match(/^BeatmapID:\s*(\d+)/m);
  const m2 = section.match(/^BeatmapSetID:\s*(\d+)/m);
  if (m1) beatmapId = Number.parseInt(m1[1]!, 10);
  if (m2) setId = Number.parseInt(m2[1]!, 10);
  return { beatmapId, setId };
}

// ---- Key structure summary: per category (jack/stream/ln), list
//      { keyType, bpm, pct } where pct = cell share of non-break cells.
interface StructureEntry { keyType: string; bpm: number; pct: number; cells: number }

function summarizeStructures(ga: NonNullable<ReturnType<typeof analyzeBeatmap>["gridAnalysis"]>): Record<string, StructureEntry[]> {
  const total = ga.cells.filter((c) => c.category !== "break").length || 1;
  const byCat: Record<string, Map<string, { keyType: string; bpmSum: number; cells: number }>> = {
    jack: new Map(), stream: new Map(), ln: new Map(),
  };
  for (const seg of ga.segments) {
    const cat = seg.category === "jack" || seg.category === "stream" || seg.category === "ln" ? seg.category : null;
    if (!cat || seg.cells.length === 0) continue;
    const bucket = byCat[cat]!;
    const key = `${seg.keyType}@${Math.round(seg.effectiveBPM)}`;
    const cur = bucket.get(key) ?? { keyType: seg.keyType, bpmSum: 0, cells: 0 };
    cur.bpmSum += seg.effectiveBPM * seg.cells.length;
    cur.cells += seg.cells.length;
    bucket.set(key, cur);
  }
  const out: Record<string, StructureEntry[]> = {};
  for (const cat of Object.keys(byCat)) {
    out[cat] = [...byCat[cat]!.values()]
      .map((v) => ({ keyType: v.keyType, bpm: Math.round(v.bpmSum / v.cells), cells: v.cells, pct: +(v.cells / total * 100).toFixed(1) }))
      .sort((a, b) => b.cells - a.cells)
      .slice(0, 4);
  }
  return out;
}

interface ScanMap {
  md5: string;
  file: string;
  artist: string;
  title: string;
  version: string;
  creator: string;
  beatmapId: number;
  setId: number;
  bpm: number;
  durationSec: number;
  sunny: number;
  lnRatio: number;
  structures: Record<string, StructureEntry[]>;
  vibro: { isVibro: boolean; label: string };
  pools: Record<string, number>;
  mainPool: string;
  est: { mode: string; rc: number | null; ln: number | null };
}

async function main(): Promise<void> {
  mkdirSync(MAPS_DIR, { recursive: true });
  const files = collectOsuFiles(MAPS_DIR);
  console.log(`[scan] ${files.length} maps in ${MAPS_DIR}`);

  const maps: ScanMap[] = [];
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const text = readFileSync(file, "utf-8");
    let result;
    try {
      result = analyzeBeatmap(text);
    } catch (err) {
      failed++;
      console.log(`  [fail] ${file}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const ga = result.gridAnalysis;
    const meta = result.meta;
    const est = estimateDifficulty(result);
    const ids = parseBeatmapIds(text);
    const durationSec = ga && ga.cells.length > 0
      ? Math.round((ga.cells[ga.cells.length - 1]!.endTime - ga.cells[0]!.startTime) / 1000)
      : 0;
    // LN pool: dominant of the four pool scores (user's own analysis)
    const ln = result.custom.ln;
    const pools: Record<string, number> = {
      coordination: ln.coordinationPoolScore,
      density: ln.densityPoolScore,
      wildcard: ln.wildcardPoolScore,
      technical: ln.technicalPoolScore,
    };
    const mainPool = (Object.entries(pools).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ?? "none") as string;
    maps.push({
      md5: md5Of(text),
      file: file.slice(MAPS_DIR.length + 1),
      artist: meta.artist,
      title: meta.title,
      pools,
      mainPool,
      version: meta.version,
      creator: meta.creator,
      beatmapId: ids.beatmapId,
      setId: ids.setId,
      bpm: meta.bpm,
      durationSec,
      sunny: result.sunny.star > 0 ? +result.sunny.star.toFixed(3) : 0,
      lnRatio: +(meta.lnRatio ?? 0).toFixed(4),
      structures: ga ? summarizeStructures(ga) : { jack: [], stream: [], ln: [] },
      vibro: { isVibro: est.mode === "vibro", label: ga?.vibroLabel ?? "" },
      est,
    });
    if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${files.length}`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    estimator: "akutav0",
    maps,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 1));
  console.log(`[scan] wrote ${OUT_PATH} (${maps.length} maps, ${failed} failed)`);
}

await main();

