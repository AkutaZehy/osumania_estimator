// ============================================================
// Ref Tool — 现有gridAnalysis分析stg1-4输出结构 + 每类键型
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { analyzeGrid } from "../src/custom/gridAnalysis.js";
import { analyzeSections } from "../src/custom/sectionAnalysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");
const OUT_DIR = path.resolve(__dirname, "../ref-output");

interface MapResult {
  file: string;
  short: string;
  bpm: number;
  grid: NonNullable<ReturnType<typeof analyzeGrid>>;
  section: ReturnType<typeof analyzeSections>;
}

function getShortName(filename: string): string {
  const match = filename.match(/\[(.+?)\]/);
  return match ? match[1] : filename;
}

function analyzeMap(osuText: string) {
  const parser = new OsuFileParser(osuText);
  parser.process();
  return parser.getParsedData();
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allFiles = fs.readdirSync(LN_MAPS_DIR).filter((f) => f.endsWith(".osu"));

  for (const stage of [1, 2, 3, 4]) {
    const stageFiles = allFiles.filter((f) => f.includes(`Stage ${stage}`));
    const results: MapResult[] = [];

    console.log(`\n${"█".repeat(120)}`);
    console.log(`  STAGE ${stage} — ${stageFiles.length} maps  |  Grid Analysis (ref tool)`);
    console.log(`  Stage ${stage}: ${
      stage === 1 ? "All-round/hybrid" :
      stage === 2 ? "Release/technical" :
      stage === 3 ? "Inverse/wall" : "Speed/density"
    }`);
    console.log(`${"█".repeat(120)}`);

    // ---- Phase 1: Run analyzeGrid on each map ----
    for (const file of stageFiles) {
      const short = getShortName(file);
      const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
      const beatmap = analyzeMap(osuText);
      const bpm = beatmap.timingPoints.find((tp) => tp.uninherited)
        ? Math.round(60000 / beatmap.timingPoints.find((tp) => tp.uninherited)!.beatLength)
        : 0;

      const grid = analyzeGrid(beatmap);
      const section = analyzeSections(beatmap);

      if (grid) {
        results.push({ file, short, bpm, grid, section });
      }
    }

    // ---- Phase 2: Overall BPM Key Type structure ----
    const allBPMKeyTypes = new Map<string, { cellCount: number; bpm: number; keyType: string; count: number }>();

    for (const r of results) {
      for (const bkt of r.grid.bpmKeyTypes) {
        // key = type + rounded BPM for grouping
        const key = `${bkt.keyType}|${Math.round(bkt.bpm / 10) * 10}`;
        const existing = allBPMKeyTypes.get(key);
        if (existing) {
          existing.cellCount += bkt.cellCount;
          existing.count++;
        } else {
          allBPMKeyTypes.set(key, {
            keyType: bkt.keyType,
            bpm: bkt.bpm,
            cellCount: bkt.cellCount,
            count: 1,
          });
        }
      }
    }

    const totalCells = [...allBPMKeyTypes.values()].reduce((s, v) => s + v.cellCount, 0);

    console.log(`\n  📊 全谱面BPM键型分布 (所有map合计):`);
    console.log(`  ${"─".repeat(80)}`);
    const sorted = [...allBPMKeyTypes.entries()].sort((a, b) => b[1].cellCount - a[1].cellCount);
    for (const [key, val] of sorted) {
      const pct = totalCells > 0 ? (val.cellCount / totalCells * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 2));
      console.log(`  ${val.keyType.padEnd(22)} @ ${val.bpm}BPM  ${bar} ${pct.toFixed(1)}% (${val.cellCount} cells, ${val.count} maps)`);
    }
    console.log(`  ${"─".repeat(80)}`);
    console.log(`  Total: ${totalCells} cells across ${results.length} maps`);

    // ---- Phase 3: LN subtype breakdown per map ----
    console.log(`\n  📌 LN子类型分布 (每个map):`);
    console.log(`  ${"─".repeat(80)}`);

    // Per-LN-subtype key patterns
    const lnSubtypeKeyPatterns: Record<string, Map<string, number>> = {};
    const lnSubtypeCounts: Record<string, number> = {};

    for (const r of results) {
      // Get LN subtypes from section analysis per-segment
      const lnSegments = r.section.segments.filter((s) => s.category === "ln");
      const lnTypes = new Set(lnSegments.flatMap((s) => s.triggeredLNTypes.map((t) => t.name)));

      // Show LN types + grid main type
      const lnTypeStr = [...lnTypes].join(", ") || "(none)";
      console.log(`  ${String(r.bpm).padStart(3)}BPM ${r.short.padEnd(24)}  LN: ${lnTypeStr.padEnd(30)}  Main: ${r.grid.mainKeyType.keyType} @ ${r.grid.mainKeyType.bpm}BPM`);

      // Cross-reference: for each LN subtype in each map, what grid key types exist?
      // Get the grid segments for this map
      for (const lnType of lnTypes) {
        if (!lnSubtypeKeyPatterns[lnType]) lnSubtypeKeyPatterns[lnType] = new Map();
        if (!lnSubtypeCounts[lnType]) lnSubtypeCounts[lnType] = 0;
        lnSubtypeCounts[lnType]++;

        // From grid: collect all key types in this map
        for (const bkt of r.grid.bpmKeyTypes) {
          const kt = bkt.keyType;
          const existing = lnSubtypeKeyPatterns[lnType]!.get(kt) ?? 0;
          lnSubtypeKeyPatterns[lnType]!.set(kt, existing + bkt.cellCount);
        }
      }
    }

    // ---- Phase 4: Per-LN-subtype key pattern summary ----
    console.log(`\n  🔗 LN子类型 ↔ 共现键型 (全stage):`);
    console.log(`  ${"─".repeat(80)}`);

    for (const [lnType, patterns] of Object.entries(lnSubtypeKeyPatterns)) {
      const mapCount = lnSubtypeCounts[lnType] ?? 0;
      const totalP = [...patterns.values()].reduce((s, v) => s + v, 0);
      console.log(`\n  【${lnType}】 (出现在 ${mapCount} 个map中):`);

      const sortedPatterns = [...patterns.entries()].sort((a, b) => b[1] - a[1]);
      for (const [kt, count] of sortedPatterns) {
        const pct = totalP > 0 ? (count / totalP * 100) : 0;
        const bar = "█".repeat(Math.round(pct / 3));
        console.log(`    ${kt.padEnd(22)} ${bar} ${pct.toFixed(1)}% (${count})`);
      }
    }

    // ---- Phase 5: Per-map detail ----
    console.log(`\n  📋 详细段结构 (每个map的segment分解):`);
    console.log(`  ${"─".repeat(80)}`);

    for (const r of results) {
      console.log(`\n  → ${r.bpm}BPM ${r.short}`);

      // Group grid segments by keyType
      const segByType = new Map<string, { count: number; cells: number }>();
      for (const seg of r.grid.segments) {
        const kt = seg.keyType || seg.category;
        const existing = segByType.get(kt) ?? { count: 0, cells: 0 };
        existing.count++;
        existing.cells += seg.cells.length;
        segByType.set(kt, existing);
      }

      const totalSegs = [...segByType.values()].reduce((s, v) => s + v.count, 0);
      const totalSegCells = [...segByType.values()].reduce((s, v) => s + v.cells, 0);

      const sortedSegs = [...segByType.entries()].sort((a, b) => b[1].cells - a[1].cells);
      for (const [kt, info] of sortedSegs) {
        const pct = totalSegCells > 0 ? (info.cells / totalSegCells * 100) : 0;
        console.log(`    ${kt.padEnd(22)} ${info.count}段, ${info.cells}cells (${pct.toFixed(0)}%)`);
      }
    }

    // ---- Phase 6: Save detailed output ----
    const outLines: string[] = [];
    outLines.push(`# Stage ${stage} — Ref Grid Analysis`);
    outLines.push(``);

    for (const r of results) {
      outLines.push(`## ${r.bpm}BPM ${r.short}`);
      outLines.push(``);
      outLines.push(`### Overall: ${r.grid.mainKeyType.keyType} @ ${r.grid.mainKeyType.bpm}BPM`);
      outLines.push(`BPM Range: ${r.grid.bpmRange.min}-${r.grid.bpmRange.max}`);
      outLines.push(``);
      outLines.push(`| Key Type | BPM | Cells | % |`);
      outLines.push(`|---|---|---|---|`);
      for (const bkt of r.grid.bpmKeyTypes) {
        outLines.push(`| ${bkt.keyType} | ${bkt.bpm} | ${bkt.cellCount} | ${bkt.percentage.toFixed(1)}% |`);
      }
      outLines.push(``);
      outLines.push(`### Segments:`);
      outLines.push(``);
      for (const seg of r.grid.segments) {
        const cat = seg.category;
        const kt = seg.keyType || "?";
        const cells = seg.cells.length;
        const dur = ((seg.endTime - seg.startTime) / 1000).toFixed(1);
        outLines.push(`- [${cat}] ${kt}  ${dur}s  ${cells}cells  ${seg.effectiveBPM}BPM`);
        if (seg.lnSubtype) {
          const lnSubs = seg.lnSubtypes.map((t) => `${t.name}=${t.value}`).join(", ");
          outLines.push(`  LN: ${lnSubs}`);
        }
      }
      outLines.push(``);
    }

    const outFile = path.join(OUT_DIR, `stage${stage}-ref-grid.md`);
    fs.writeFileSync(outFile, outLines.join("\n"), "utf-8");
    console.log(`\n  💾 已保存: ${outFile}`);
  }

  // ---- Cross-stage summary ----
  console.log(`\n\n${"█".repeat(120)}`);
  console.log(`  跨Stage对比总结`);
  console.log(`${"█".repeat(120)}`);

  // Collect per-stage LN subtype dominance
  for (const stage of [1, 2, 3, 4]) {
    const stageFiles = allFiles.filter((f) => f.includes(`Stage ${stage}`));
    const lnSubDist: Record<string, number> = {};

    for (const file of stageFiles) {
      const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
      const beatmap = analyzeMap(osuText);
      const section = analyzeSections(beatmap);

      for (const seg of section.segments) {
        if (seg.category === "ln") {
          for (const t of seg.triggeredLNTypes) {
            lnSubDist[t.name] = (lnSubDist[t.name] ?? 0) + 1;
          }
        }
      }
    }

    const total = Object.values(lnSubDist).reduce((a, b) => a + b, 0);
    const sortedSubs = Object.entries(lnSubDist).sort((a, b) => b[1] - a[1]);
    console.log(`\n  Stage ${stage} — LN子类型 (${total} triggers):`);
    for (const [type, count] of sortedSubs) {
      console.log(`    ${type}: ${count} (${(count / total * 100).toFixed(0)}%)`);
    }
  }
}

main();
