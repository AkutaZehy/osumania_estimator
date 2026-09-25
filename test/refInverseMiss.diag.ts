// ============================================================
// Stage 2 & 3: ref Inverse漏检分析 + 当前算法对比
// 找出 ref 和 当前系统 各自漏掉的Inverse
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
  return m ? m[1] : filename;
}

async function main() {
  // ── 加载 ref 工具 ──
  const parserMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/parser/patternOsuParser.js`
  );
  const summaryMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/summary.js`
  );
  const defMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/patternsDef.js`
  );
  const primMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/primitives.js`
  );
  const chartMod = await import(
    `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/chart.js`
  );

  const { parseOsuManiaFromText } = parserMod;
  const { fromChart } = summaryMod;
  const { DENSITY_4K_INVERSE, inverseReady, COORDINATION_RELEASE } = defMod;
  const { calculatePrimitives } = primMod;
  const { NoteType } = chartMod;

  // ── 加载当前系统 ──
  const { OsuFileParser } = await import("../src/parser/osuFileParser.js");
  const { analyzeSections } = await import("../src/custom/sectionAnalysis.js");

  const allFiles = fs.readdirSync(LN_MAPS_DIR).filter((f) => f.endsWith(".osu"));

  for (const stage of [2, 3]) {
    const stageFiles = allFiles.filter((f) => f.includes(`Stage ${stage}`));

    console.log(`\n${"█".repeat(140)}`);
    console.log(`  STAGE ${stage} — ${stageFiles.length} maps — Inverse漏检分析`);
    console.log(`  Stage ${stage}: ${stage === 2 ? "Release/technical" : "Inverse/wall"}`);
    console.log(`${"█".repeat(140)}`);

    for (const file of stageFiles) {
      const short = getShortName(file);
      const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");

      // ── Ref tool analysis ──
      const chart = parseOsuManiaFromText(osuText);
      const primitives = calculatePrimitives(chart);
      const report = fromChart(chart);

      // ── Current system analysis ──
      const parser = new OsuFileParser(osuText);
      parser.process();
      const beatmap = parser.getParsedData();
      const section = analyzeSections(beatmap);
      const bpm = beatmap.timingPoints.find((tp) => tp.uninherited)
        ? Math.round(60000 / beatmap.timingPoints.find((tp) => tp.uninherited)!.beatLength)
        : 0;

      // ── Extract ref tool's Inverse info ──
      const inverseClusters = report.Clusters.filter(
        (c: any) => c.Pattern === "Density" && c.SpecificTypes?.some((st: any) => st[0] === "Inverse")
      );
      const hasInverse = inverseClusters.length > 0;
      const inverseAmount = inverseClusters.reduce((s: number, c: any) => s + c.Amount, 0);
      const totalAmount = report.Clusters.reduce((s: number, c: any) => s + c.Amount, 0);

      // ── Run inverseReady on each 5-row window to find where ref WOULD detect Inverse ──
      // This lets us find the specific time ranges where inverseReady passes
      const inverseWindows: Array<{ startTime: number; endTime: number; rows: number[] }> = [];
      for (let i = 0; i < primitives.length - 4; i++) {
        const slice = primitives.slice(i, i + 5);
        // Check if there are LN tails and heads (basic pre-condition)
        const hasLT = slice.some((r: any) => r.LNTails.length > 0);
        const hasLH = slice.some((r: any) => r.LNHeads.length > 0);
        if (!hasLT || !hasLH) continue;

        try {
          if (inverseReady(slice)) {
            const startTime = slice[0].Time;
            const endTime = slice[4].Time;
            const rowIndices = slice.map((r: any) => r.Index);
            inverseWindows.push({ startTime, endTime, rows: rowIndices });
          }
        } catch { /* skip invariant violations */ }
      }

      // ── Merge overlapping inverse windows into continuous segments ──
      const mergedWindows: Array<{ startTime: number; endTime: number; count: number }> = [];
      if (inverseWindows.length > 0) {
        let cur = { startTime: inverseWindows[0].startTime, endTime: inverseWindows[0].endTime, count: 1 };
        for (let i = 1; i < inverseWindows.length; i++) {
          const w = inverseWindows[i];
          if (w.startTime <= cur.endTime + 100) { // merge if within 100ms
            cur.endTime = Math.max(cur.endTime, w.endTime);
            cur.count++;
          } else {
            mergedWindows.push(cur);
            cur = { startTime: w.startTime, endTime: w.endTime, count: 1 };
          }
        }
        mergedWindows.push(cur);
      }

      // ── Get our system's per-measure inverse metrics ──
      const highInverseMeasures = section.measures.filter(
        (m) => m.lnMetrics && m.lnMetrics.inverse >= 15
      );

      // ── Find the mismatch: our system says high inverse but ref didn't detect ──
      const refMissed: Array<{ measureIdx: number; startTime: number; metrics: any; refWhy: string[] }> = [];

      for (const m of highInverseMeasures) {
        if (!m.lnMetrics || m.category !== "ln") continue;

        const mStart = m.startTime;
        const mEnd = m.endTime;

        // Check if this measure's time range overlaps with any ref inverse window
        const isInRef = mergedWindows.some(
          (w) => mStart < w.endTime && mEnd > w.startTime
        );

        if (!isInRef) {
          // Our system says inverse≥15 but ref didn't catch it
          const reasons: string[] = [];

          // Analyze why ref missed it
          // Find the primitives rows in this measure's time range
          const relevantPrimitives = primitives.filter(
            (p: any) => p.Time >= mStart && p.Time < mEnd
          );

          if (relevantPrimitives.length < 5) {
            reasons.push(`too_few_rows(${relevantPrimitives.length})`);
          } else {
            // Check each condition of inverseReady
            const hasNormal = relevantPrimitives.slice(0, 5).some((r: any) => r.NormalNotes.length > 0);
            if (hasNormal) reasons.push(`has_NormalNotes_in_window`);

            const maxBodies = Math.max(...relevantPrimitives.slice(0, 5).map((r: any) => r.LNBodies.length));
            if (maxBodies < 3) reasons.push(`maxBodies=${maxBodies}<3`);

            // Check gaps
            const gaps: number[] = [];
            for (let i = 0; i < Math.min(4, relevantPrimitives.length - 1); i++) {
              if (relevantPrimitives[i].LNTails.length > 0 && relevantPrimitives[i + 1].LNHeads.length > 0) {
                gaps.push(relevantPrimitives[i + 1].Time - relevantPrimitives[i].Time);
              }
            }
            if (gaps.length < 2) reasons.push(`gaps=${gaps.length}<2`);
            else {
              const gapSpread = Math.max(...gaps) - Math.min(...gaps);
              if (gapSpread > 5) reasons.push(`gap_spread=${gapSpread.toFixed(1)}ms>5ms`);
            }
          }

          refMissed.push({
            measureIdx: m.index,
            startTime: mStart,
            metrics: { ...m.lnMetrics },
            refWhy: reasons,
          });
        }
      }

      // ── Also find: ref says Inverse but our system says low inverse ──
      const ourMissed: Array<{ windowStart: number; windowEnd: number; ourInverse: number }> = [];
      for (const w of mergedWindows) {
        // Find measures that overlap with this window
        const overlapping = section.measures.filter(
          (m) => m.startTime < w.endTime && m.endTime > w.startTime && m.lnMetrics
        );
        const maxInverse = overlapping.length > 0
          ? Math.max(...overlapping.map((m) => m.lnMetrics?.inverse ?? 0))
          : 0;
        if (maxInverse < 20 && overlapping.some((m) => m.category === "ln")) {
          ourMissed.push({
            windowStart: w.startTime,
            windowEnd: w.endTime,
            ourInverse: Math.round(maxInverse * 10) / 10,
          });
        }
      }

      // ── PRINT RESULTS for this map ──
      const invPct = totalAmount > 0 ? ((inverseAmount / totalAmount) * 100).toFixed(1) : "0.0";
      const invTime = (inverseAmount / 1000).toFixed(1);
      const refWindowCount = mergedWindows.length;
      const totalINWindows = inverseWindows.length;

      // Compute our system's Inverse rate
      const ourLNMeasures = section.measures.filter((m) => m.category === "ln" && m.lnSubtype);
      const ourInvCount = ourLNMeasures.filter((m) => m.lnSubtype === "LN Reverse").length;
      const ourTotal = ourLNMeasures.length;

      console.log(`\n  ${"=".repeat(130)}`);
      console.log(`  ${short}  @ ${bpm}BPM`);
      console.log(`  Ref: Inverse ${invPct}% (${invTime}s, ${refWindowCount} segments, ${totalINWindows} windows)`);
      console.log(`  Us:  LN Reverse ${ourInvCount}/${ourTotal} (${ourTotal > 0 ? (ourInvCount / ourTotal * 100).toFixed(0) : 0}%) | highInv(≥15): ${highInverseMeasures.length}`);

      // Show ref Inverse windows timing
      if (mergedWindows.length > 0) {
        const totalInvTime = mergedWindows.reduce((s, w) => s + (w.endTime - w.startTime), 0);
        console.log(`  Ref Inverse windows: ${mergedWindows.length} segs, ${(totalInvTime / 1000).toFixed(1)}s total`);
        for (const w of mergedWindows.slice(0, 5)) {
          console.log(`    ${(w.startTime / 1000).toFixed(1)}s-${(w.endTime / 1000).toFixed(1)}s (${((w.endTime - w.startTime) / 1000).toFixed(1)}s, ${w.count} windows)`);
        }
        if (mergedWindows.length > 5) console.log(`    ... and ${mergedWindows.length - 5} more`);
      }

      // ── Our system high inverse but ref missed ──
      if (refMissed.length > 0) {
        console.log(`  \n  ❌ 我们判Inverse但ref漏检 (${refMissed.length} measures):`);
        for (const rm of refMissed.slice(0, 8)) {
          const m = rm.metrics;
          console.log(`    M${rm.measureIdx + 1} @ ${(rm.startTime / 1000).toFixed(1)}s: inverse=${m.inverse.toFixed(1)}% overlay=${m.overlay.toFixed(1)}% ar=${m.ar.toFixed(1)}% ouro=${m.ouroboros.toFixed(1)}%`);
          console.log(`      ref为什么漏: ${rm.refWhy.join(", ")}`);
        }
        if (refMissed.length > 8) console.log(`    ... and ${refMissed.length - 8} more`);
      }

      // ── Ref says Inverse but our system missed ──
      if (ourMissed.length > 0) {
        console.log(`  \n  ⚠️  ref判Inverse但我们漏检 (${ourMissed.length} segments):`);
        for (const om of ourMissed.slice(0, 5)) {
          // Get the notes in this window
          const notesInWindow = section.measures.filter(
            (m) => m.startTime < om.windowEnd && m.endTime > om.windowStart
          );
          const noteSummary = notesInWindow.map((m) =>
            `${m.lnSubtype ?? m.category}(inv=${m.lnMetrics?.inverse.toFixed(1) ?? "?"}%)`
          ).join(", ");
          console.log(`    ${(om.windowStart / 1000).toFixed(1)}s-${(om.windowEnd / 1000).toFixed(1)}s: 我们的inverse最高=${om.ourInverse}%`);
          console.log(`      段落: ${noteSummary}`);
        }
        if (ourMissed.length > 5) console.log(`    ... and ${ourMissed.length - 5} more`);
      }

      // ── Deep dive: analyze ref's non-Inverse clusters that have high inverse potential ──
      // Focus on what ref classified as NOT Inverse
      const nonInvDensityClusters = report.Clusters.filter(
        (c: any) => c.Pattern === "Density" &&
          !c.SpecificTypes?.some((st: any) => st[0] === "Inverse")
      );

      if (nonInvDensityClusters.length > 0) {
        console.log(`  \n  📋 ref的Density非Inverse子类型:`);
        for (const c of nonInvDensityClusters) {
          const stName = c.SpecificTypes?.[0]?.[0] ?? "(none)";
          const stRatio = c.SpecificTypes?.[0]?.[1] ?? 0;
          console.log(`    ${c.Pattern}/${stName} @ ${c.BPM}BPM ${(c.Amount / 1000).toFixed(1)}s (specificRatio=${(stRatio * 100).toFixed(0)}%)`);
        }
      }

      // Show non-Density clusters that are close to LN context
      const lnAdjacentClusters = report.Clusters.filter(
        (c: any) => !["Density", "Coordination", "Wildcard"].includes(c.Pattern)
      );
      if (lnAdjacentClusters.length > 0) {
        console.log(`  \n  📋 非LN Core类型（RC类型）:`);
        for (const c of lnAdjacentClusters.slice(0, 5)) {
          const stName = c.SpecificTypes?.[0]?.[0] ?? c.Pattern;
          console.log(`    ${stName} @ ${c.BPM}BPM ${(c.Amount / 1000).toFixed(1)}s`);
        }
      }
    }
  }
}

main();
