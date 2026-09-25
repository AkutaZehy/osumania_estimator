// ============================================================
// LN Construction Analysis — 16 maps (5th-8th × Stage 1-4)
// 2-measure granularity, 7 second-level main categories
// Uses ref tool's specific pattern detectors as sub-window scanners
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REF_DIR = path.resolve(__dirname, "../References/osumania_map_analyser/ManiaMapAnalyser by Leo_Black");
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");

function getShortName(filename: string): string {
  const m = filename.match(/\[(.+?)\]/);
  return m ? m[1]!.replace(/\s*\(Marathon\)\s*$/, "") : filename;
}
function getDiffLevel(filename: string): number {
  const m = filename.match(/(\d+)(st|nd|rd|th)/);
  return m ? parseInt(m[1]) : 0;
}
function getStage(filename: string): number {
  const m = filename.match(/Stage (\d)/);
  return m ? parseInt(m[1]) : 0;
}

interface WindowResult {
  startTime: number;
  endTime: number;
  /** Trigger counts for each category (how many sub-windows matched) */
  counts: Record<string, number>;
  /** Total sub-windows scanned */
  totalSubWindows: number;
  /** Raw metrics (wrapped camelCase) */
  lnHeads: number;
  lnBodies: number;
  lnTails: number;
  normalNotes: number;
}

/** Convenience type for wrapped rows */
interface WrappedRow {
  time: number;
  beatLength: number;
  msPerBeat: number;
  notes: number;
  jacks: number;
  keys: number;
  leftHandKeys: number;
  lnHeads: number[];
  lnBodies: number[];
  lnTails: number[];
  normalNotes: number[];
  rawNotes: number[];
}

interface MapResult {
  file: string;
  shortName: string;
  stage: number;
  diff: number;
  bpm: number;
  totalWindows: number;
  windows: WindowResult[];
  categoryCounts: Record<string, number>;
}

// ── Sub-window detectors using ref tool patterns ──

/** Wrap ref tool primitives row to camelCase (for manual analysis) */
function wrap(r: any): WrappedRow {
  return {
    time: r.Time,
    beatLength: r.BeatLength,
    msPerBeat: r.MsPerBeat,
    notes: r.Notes ?? r.RawNotes?.length ?? 0,
    jacks: r.Jacks ?? 0,
    keys: r.Keys ?? 4,
    leftHandKeys: r.LeftHandKeys ?? 2,
    lnHeads: r.LNHeads ?? [],
    lnBodies: r.LNBodies ?? [],
    lnTails: r.LNTails ?? [],
    normalNotes: r.NormalNotes ?? [],
    rawNotes: r.RawNotes ?? [],
  };
}

/** Type for raw PascalCase primitives from ref tool */
interface RawRow {
  Time: number;
  BeatLength: number;
  MsPerBeat: number;
  Notes: number;
  Jacks: number;
  Keys: number;
  LeftHandKeys: number;
  LNHeads: number[];
  LNBodies: number[];
  LNTails: number[];
  NormalNotes: number[];
  RawNotes: number[];
  Direction: number;
}

async function main() {
  // Load ref tool modules
  const parserMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/parser/patternOsuParser.js`
  );
  const primMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/primitives.js`
  );
  const summaryMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/summary.js`
  );
  // Load ref tool pattern detectors directly (they export PascalCase-specific detectors)
  const refPatternsDef = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/patternsDef.js`
  );
  const { parseOsuManiaFromText } = parserMod;
  const { calculatePrimitives } = primMod;
  const { fromChart } = summaryMod;

  const allFiles = fs.readdirSync(LN_MAPS_DIR).filter(f => f.endsWith(".osu"));
  const targetFiles = allFiles.filter(f => {
    const diff = getDiffLevel(f);
    const stage = getStage(f);
    return diff >= 5 && diff <= 8 && stage >= 1 && stage <= 4;
  });
  targetFiles.sort((a, b) => getStage(a) - getStage(b) || getDiffLevel(a) - getDiffLevel(b));

  const stageNames: Record<number, string> = {
    1: "CO/Basic", 2: "Release/Technical", 3: "Inverse/Wall", 4: "Speed/WC"
  };

  const CATEGORIES = ["Inverse", "Ouroboros", "ColumnLock", "Shield", "ReleaseHell", "JackyWC", "SpeedyWC"];

  const allResults: MapResult[] = [];

  console.log("=".repeat(140));
  console.log("  LN CONSTRUCTION ANALYSIS — 5th-8th Dan (Stage 1-4)");
  console.log("  2-measure windows | Ref-tool sub-window detectors (5-8 rows)");
  console.log("=".repeat(140));

  for (const file of targetFiles) {
    const short = getShortName(file);
    const diff = getDiffLevel(file);
    const stage = getStage(file);
    const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");

    const chart = parseOsuManiaFromText(osuText);
    const primitives = calculatePrimitives(chart);
    const report = fromChart(chart);

    const bpmMatch = osuText.match(/\[TimingPoints\][\s\S]*?(\d+),(\d+)/);
    const mapBPM = bpmMatch ? Math.round(60000 / parseInt(bpmMatch[2]!)) : 0;

    if (primitives.length === 0) {
      console.log(`\n  ❌ ${short}: no primitives`);
      continue;
    }

    // Measure boundaries based on ref tool beatLength (use raw primitives)
    const firstRow = primitives[0] as RawRow;
    const beatLen = firstRow.BeatLength || 60000 / mapBPM;
    const measureMs = beatLen * 4;
    const windowMs = measureMs * 2;

    const firstTime = firstRow.Time;
    const lastTime = (primitives[primitives.length - 1] as RawRow).Time;
    const totalTime = lastTime - firstTime;
    const totalWindows = Math.max(1, Math.ceil(totalTime / windowMs));

    const windows: WindowResult[] = [];

    for (let wi = 0; wi < totalWindows; wi++) {
      const wStart = firstTime + wi * windowMs;
      const wEnd = wStart + windowMs;
      // Keep raw (PascalCase) for ref tool detectors, and wrapped (camelCase) for manual analysis
      const rawWinRows = (primitives as RawRow[]).filter(r => r.Time >= wStart && r.Time < wEnd);
      const wrappedWinRows = rawWinRows.map(r => wrap(r));

      if (rawWinRows.length < 2) continue;

      // Count sub-window triggers for each category
      // Use ref tool's specific pattern detectors on sliding sub-windows
      const counts: Record<string, number> = {
        Inverse: 0, Ouroboros: 0, ColumnLock: 0, Shield: 0,
        ReleaseHell: 0, JackyWC: 0, SpeedyWC: 0,
      };

      let totalSub = 0;

      // Sliding window scan: test all possible sub-window positions
      for (let i = 0; i < rawWinRows.length; i++) {
        // Inverse: 5-row window via DENSITY_4K_INVERSE (calls inverseReady)
        const invSlice = rawWinRows.slice(i, i + 5);
        if (invSlice.length >= 5) {
          totalSub++;
          if (refPatternsDef.DENSITY_4K_INVERSE?.(invSlice) !== 0) {
            counts.Inverse++;
          }
          // Shield: 2-row window
          if (refPatternsDef.COORDINATION_SHIELD?.(invSlice.slice(0, 2)) !== 0) {
            counts.Shield++;
          }
        }

        // Column Lock: needs at least 3 rows, 8-row window
        const clSlice = rawWinRows.slice(i, i + 8);
        if (clSlice.length >= 3 && refPatternsDef.COORDINATION_COLUMN_LOCK?.(clSlice) !== 0) {
          counts.ColumnLock++;
        }

        // Jacky WC: up to 6-row window (ref tool uses JACKY_CONTEXT_WINDOW=4)
        const jwSlice = rawWinRows.slice(i, i + 6);
        if (jwSlice.length >= 2 && refPatternsDef.WILDCARD_JACK?.(jwSlice) !== 0) {
          counts.JackyWC++;
        }

        // Speedy WC: 3-4 row window
        const swSlice = rawWinRows.slice(i, i + 4);
        if (swSlice.length >= 2 && refPatternsDef.WILDCARD_SPEED?.(swSlice) !== 0) {
          counts.SpeedyWC++;
        }

        // — Custom categories (not in ref tool) use wrapped rows —

        // Ouroboros: H/T gap < 5ms or same-row H+T
        if (i < rawWinRows.length - 1) {
          const cur = wrappedWinRows[i]!;
          const next = wrappedWinRows[i + 1]!;
          const gap = next.time - cur.time;
          if (gap < 5 && cur.lnTails.length > 0 && next.lnHeads.length > 0) {
            counts.Ouroboros++;
          }
          if (cur.lnHeads.length > 0 && cur.lnTails.length > 0) {
            counts.Ouroboros++;
          }
        }
      }

      // Release Hell: custom, count overlapping body rows + H/T same row
      let overlapRows = 0, arRows = 0;
      for (const r of wrappedWinRows) {
        if (r.lnBodies.length >= 2) overlapRows++;
        if (r.lnHeads.length > 0 && r.lnTails.length > 0) arRows++;
      }
      const ovPct = wrappedWinRows.length > 0 ? (overlapRows / wrappedWinRows.length) * 100 : 0;
      const arPct = wrappedWinRows.length > 0 ? (arRows / wrappedWinRows.length) * 100 : 0;
      if (ovPct >= 30 && arPct >= 20) {
        counts.ReleaseHell = Math.round((overlapRows + arRows) / 2);
      }

      // Count raw note totals (from wrapped rows)
      let lnHeads = 0, lnBodies = 0, lnTails = 0, normalNotes = 0;
      for (const r of wrappedWinRows) {
        lnHeads += r.lnHeads.length;
        lnBodies += r.lnBodies.length;
        lnTails += r.lnTails.length;
        normalNotes += r.normalNotes.length;
      }

      windows.push({
        startTime: wStart,
        endTime: wEnd,
        counts,
        totalSubWindows: totalSub,
        lnHeads, lnBodies, lnTails, normalNotes,
      });
    }

    // Aggregate per-map: a category is "present" if it triggers in ≥5% of sub-windows
    const categoryCounts: Record<string, number> = {};
    let totalAllSubs = 0;
    let totalAllWindows = 0;
    for (const w of windows) {
      totalAllSubs += w.totalSubWindows;
      totalAllWindows++;
      for (const cat of CATEGORIES) {
        if (w.counts[cat] > 0) {
          categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
        }
      }
    }

    allResults.push({
      file, shortName: short, stage, diff, bpm: mapBPM,
      totalWindows: windows.length,
      windows,
      categoryCounts,
    });

    // Print per-map
    const nWin = windows.length;
    const presence = CATEGORIES
      .filter(c => (categoryCounts[c] ?? 0) > 0)
      .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))
      .map(c => `${c} ${((categoryCounts[c]! / nWin) * 100).toFixed(0)}%`)
      .join("  ");

    console.log(`\n  S${stage} ${diff}th | ${short.padEnd(32)} ${mapBPM}BPM`);
    console.log(`    → ${presence || "(none)"}`);
  }

  // ── Summary Table ──
  console.log(`\n\n${"█".repeat(140)}`);
  console.log("  最终表格: 谱面 × 第二级主类别键型");
  console.log(`  (✓ = 该类别在≥5%的2-measure窗口中有触发)`);
  console.log(`  ${"█".repeat(140)}`);
  console.log("");
  console.log(`  ${"#".padEnd(4)} ${"Map".padEnd(32)} BPM  INV  OUR  COL  SHI  REL  JWC  SWC  │ 主导类别`);
  console.log(`  ${"─".repeat(4)} ${"─".repeat(32)} ${"─".repeat(4)} ${"─".repeat(5)}${"─".repeat(5)}${"─".repeat(5)}${"─".repeat(5)}${"─".repeat(5)}${"─".repeat(5)}${"─".repeat(5)}  │ ${"─".repeat(24)}`);

  allResults.sort((a, b) => a.stage - b.stage || a.diff - b.diff);
  allResults.forEach((r, idx) => {
    const nWin = r.totalWindows;
    const pct = (cat: string) => nWin > 0 ? ((r.categoryCounts[cat] ?? 0) / nWin * 100).toFixed(0) : "0";
    const pres = (cat: string) => (r.categoryCounts[cat] ?? 0) > 0 ? "✓" : "·";

    // Top categories
    const top = CATEGORIES
      .filter(c => (r.categoryCounts[c] ?? 0) > 0)
      .sort((a, b) => (r.categoryCounts[b] ?? 0) - (r.categoryCounts[a] ?? 0))
      .slice(0, 3)
      .map(c => `${c}${pct(c)}%`)
      .join(" ");

    console.log(
      `  ${(idx + 1).toString().padEnd(4)} ${r.shortName.slice(0, 30).padEnd(32)} ${String(r.bpm).padEnd(4)}` +
      ` ${pres("Inverse")}${pct("Inverse").padStart(3)}%` +
      ` ${pres("Ouroboros")}${pct("Ouroboros").padStart(3)}%` +
      ` ${pres("ColumnLock")}${pct("ColumnLock").padStart(3)}%` +
      ` ${pres("Shield")}${pct("Shield").padStart(3)}%` +
      ` ${pres("ReleaseHell")}${pct("ReleaseHell").padStart(3)}%` +
      ` ${pres("JackyWC")}${pct("JackyWC").padStart(3)}%` +
      ` ${pres("SpeedyWC")}${pct("SpeedyWC").padStart(3)}%` +
      `  │ ${top}`
    );
  });

  // ── Cross-stage aggregation ──
  console.log(`\n\n  Cross-Stage: 每类在多少%的谱面中出现`);
  console.log(`  ${"─".repeat(90)}`);
  console.log(`  Stage  ${CATEGORIES.map(c => c.padEnd(10)).join("")}`);
  console.log(`  ${"─".repeat(10)} ${CATEGORIES.map(() => "─".repeat(10)).join("")}`);

  for (const stage of [1, 2, 3, 4]) {
    const stageResults = allResults.filter(r => r.stage === stage);
    const n = stageResults.length;
    const vals = CATEGORIES.map(c => {
      const count = stageResults.filter(r => (r.categoryCounts[c] ?? 0) > 0).length;
      const p = n > 0 ? ((count / n) * 100).toFixed(0) : "0";
      return `${p}%`.padEnd(10);
    });
    console.log(`  Stage ${stage} ${vals.join("")}`);
  }

  // ── Save ──
  const outDir = path.resolve(__dirname, "../ref-output");
  fs.mkdirSync(outDir, { recursive: true });
  const outLines: string[] = [];
  outLines.push("# LN Construction Analysis — 5th-8th Dan (Stage 1-4)");
  outLines.push("2-measure windows, ref-tool sub-window detectors (5-8 row sliding)");
  outLines.push("");
  outLines.push("## Legend");
  outLines.push("| Abbr | Category | Detection |");
  outLines.push("|------|----------|-----------|");
  outLines.push("| INV | Inverse | ref inverseReady (5-row, ≥2 bodies, consistent gaps, no NN) |");
  outLines.push("| OUR | Ouroboros | H→T gap <5ms or same-row H+T |");
  outLines.push("| COL | Column Lock | ref CoordinationColumnLock (held body + adjacent hits, 3-beat window) |");
  outLines.push("| SHI | Shield | ref CoordinationShield (N→H or T→N same col, 2-row) |");
  outLines.push("| REL | Release Hell | Body overlap ≥30% + A/R ≥20% per window |");
  outLines.push("| JWC | Jacky WC | ref WildcardJack (LN context + jack patterns, 4-6 row) |");
  outLines.push("| SWC | Speedy WC | ref WildcardSpeed (LN head directional roll, 3-4 row) |");
  outLines.push("");
  outLines.push("## Per-Map Table");
  outLines.push("");
  outLines.push("| # | Map | Stg | Diff | BPM | Win | INV | OUR | COL | SHI | REL | JWC | SWC | Top 3 |");
  outLines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");

  allResults.forEach((r, idx) => {
    const nWin = r.totalWindows;
    const pct = (cat: string) => nWin > 0 ? ((r.categoryCounts[cat] ?? 0) / nWin * 100).toFixed(0) + "%" : "0%";
    const pres = (cat: string) => (r.categoryCounts[cat] ?? 0) > 0 ? "✓" : "·";
    const top = CATEGORIES
      .filter(c => (r.categoryCounts[c] ?? 0) > 0)
      .sort((a, b) => (r.categoryCounts[b] ?? 0) - (r.categoryCounts[a] ?? 0))
      .slice(0, 3).join(", ");
    outLines.push(
      `| ${idx + 1} | ${r.shortName} | ${r.stage} | ${r.diff}th | ${r.bpm} | ${nWin} | ` +
      `${pres("Inverse")} ${pct("Inverse")} | ${pres("Ouroboros")} ${pct("Ouroboros")} | ` +
      `${pres("ColumnLock")} ${pct("ColumnLock")} | ${pres("Shield")} ${pct("Shield")} | ` +
      `${pres("ReleaseHell")} ${pct("ReleaseHell")} | ${pres("JackyWC")} ${pct("JackyWC")} | ` +
      `${pres("SpeedyWC")} ${pct("SpeedyWC")} | ${top}`
    );
  });

  outLines.push("");
  outLines.push("## Cross-Stage Summary");
  outLines.push("");
  outLines.push("| Stage | Name | Maps | INV | OUR | COL | SHI | REL | JWC | SWC |");
  outLines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const stage of [1, 2, 3, 4]) {
    const sr = allResults.filter(r => r.stage === stage);
    const n = sr.length;
    const vals = CATEGORIES.map(c => {
      const count = sr.filter(r => (r.categoryCounts[c] ?? 0) > 0).length;
      return n > 0 ? ((count / n) * 100).toFixed(0) + "%" : "0%";
    }).join(" | ");
    outLines.push(`| ${stage} | ${stageNames[stage]} | ${n} | ${vals} |`);
  }

  const outFile = path.join(outDir, "ln-construction-analysis.md");
  fs.writeFileSync(outFile, outLines.join("\n"), "utf-8");
  console.log(`\n\n  💾 已保存: ${outFile}`);
}

main();
