// Deeper dive: S3-3 per-measure and S3-5 column analysis
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REF_DIR = path.resolve(__dirname, "../References/osumania_map_analyser/ManiaMapAnalyser by Leo_Black");
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");

async function main() {
  const parserMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/parser/patternOsuParser.js`);
  const summaryMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/summary.js`);
  const primMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/primitives.js`);
  const defMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/patternsDef.js`);
  const { parseOsuManiaFromText } = parserMod;
  const { fromChart } = summaryMod;
  const { calculatePrimitives } = primMod;
  const { inverseReady } = defMod;

  const { OsuFileParser } = await import("../src/parser/osuFileParser.js");
  const { analyzeSections } = await import("../src/custom/sectionAnalysis.js");

  // ━━━━━ S3-3 detailed per-measure + column typing ━━━━━
  async function s33detail() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 3") && f.includes("3rd"))!;
    const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
    const chart = parseOsuManiaFromText(osuText);
    const primitives = calculatePrimitives(chart);
    const parser = new OsuFileParser(osuText);
    parser.process();
    const beatmap = parser.getParsedData();
    const section = analyzeSections(beatmap);

    console.log(`\n${"█".repeat(130)}`);
    console.log(`  S3-3 per-measure detail — ${file.match(/\[(.+?)\]/)?.[1]}`);
    console.log(`${"█".repeat(130)}`);

    const lnMeasures = section.measures.filter((m: any) => m.category === "ln" && m.lnMetrics);

    for (const m of lnMeasures) {
      const mStart = m.startTime;
      const mEnd = m.endTime;
      const refRows = primitives.filter((p: any) => p.Time >= mStart && p.Time < mEnd);

      // Column-level LN typing per row
      const colPattern = { C0: "", C1: "", C2: "", C3: "" };
      for (const r of refRows) {
        for (let c = 0; c < 4; c++) {
          let ch = ".";
          if (r.LNHeads.includes(c)) ch = "H";
          else if (r.LNTails.includes(c)) ch = "T";
          else if (r.LNBodies.includes(c)) ch = "B";
          else if (r.NormalNotes.includes(c)) ch = "N";
          colPattern[`C${c}`] += ch;
        }
      }

      // Check inverseReady on windows within this measure
      let invCount = 0;
      for (let i = 0; i < refRows.length - 4; i++) {
        try { if (inverseReady(refRows.slice(i, i + 5))) invCount++; } catch { }
      }

      // Co-release check: how many times do tails release together?
      let tailSyncCount = 0;
      for (const r of refRows) {
        if (r.LNTails.length >= 2) tailSyncCount++;
      }
      // Single tail releases
      let tailSingleCount = 0;
      for (const r of refRows) {
        if (r.LNTails.length === 1) tailSingleCount++;
      }

      // Column body distribution per REF primitive (not our metric)
      const colBodyRows: number[] = [0, 0, 0, 0];
      for (const r of refRows) {
        for (const c of r.LNBodies) colBodyRows[c]++;
      }

      const metrics = m.lnMetrics;
      console.log(`\n  M${String(m.index + 1).padStart(2)} @ ${(mStart / 1000).toFixed(1)}s-${(mEnd / 1000).toFixed(1)}s`);
      console.log(`   Metrics: inv=${metrics.inverse.toFixed(1)}% ovl=${metrics.overlay.toFixed(1)}% ar=${metrics.ar.toFixed(1)}% ouro=${metrics.ouroboros.toFixed(1)}%`);
      console.log(`   Col bodies(rows): [${colBodyRows.join(", ")}]  invWindow5=${invCount}`);
      console.log(`   Tail sync(≥2): ${tailSyncCount} / single: ${tailSingleCount} / total rows: ${refRows.length}`);
      console.log(`   Has NN: ${refRows.some((r: any) => r.NormalNotes.length > 0)}  maxBodies: ${Math.max(...refRows.map((r: any) => r.LNBodies.length))}`);

      // Column pattern strings (truncated for display)
      for (let c = 0; c < 4; c++) {
        const str = colPattern[`C${c}`];
        console.log(`   C${c}: ${str.slice(0, 60)}${str.length > 60 ? "..." : ""}`);
      }

      // Construction guess per measure
      if (!refRows.some((r: any) => r.NormalNotes.length > 0)) {
        // Pure LN measure
        if (tailSyncCount > tailSingleCount && tailSyncCount >= 3) {
          console.log(`   → PURE LN WALL: 大量同步释放(≥2 tail同时释放=${tailSyncCount})`);
        } else if (invCount >= 2) {
          console.log(`   → PURE LN INVERSE: 有${invCount}个inverseReady窗口`);
        } else if (tailSingleCount > tailSyncCount) {
          console.log(`   → PURE LN ROLL: 单向释放为主(single tail=${tailSingleCount})`);
        } else {
          console.log(`   → PURE LN MIXED`);
        }
      } else {
        console.log(`   → LN+RC MIXED: ${refRows.filter((r: any) => r.NormalNotes.length > 0).length} rows有NN`);
      }
    }
  }

  // ━━━━━ S3-5 Promise column-level deep dive ━━━━━
  async function s35detail() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 3") && f.includes("5th"))!;
    const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
    const chart = parseOsuManiaFromText(osuText);
    const primitives = calculatePrimitives(chart);
    const report = fromChart(chart);
    const parser = new OsuFileParser(osuText);
    parser.process();
    const beatmap = parser.getParsedData();
    const section = analyzeSections(beatmap);

    console.log(`\n${"█".repeat(130)}`);
    console.log(`  S3-5 Promise column-level detail`);
    console.log(`${"█".repeat(130)}`);

    // For each measure, show column-level LN head/tail/normal distribution
    const lnMeasures = section.measures.filter((m: any) => m.category === "ln" && m.lnMetrics);

    for (const m of lnMeasures) {
      const mStart = m.startTime;
      const mEnd = m.endTime;
      const refRows = primitives.filter((p: any) => p.Time >= mStart && p.Time < mEnd);

      // Column summary per measure
      const colSummary = { C0: { LH: 0, LT: 0, LB: 0, NN: 0 }, C1: { LH: 0, LT: 0, LB: 0, NN: 0 }, C2: { LH: 0, LT: 0, LB: 0, NN: 0 }, C3: { LH: 0, LT: 0, LB: 0, NN: 0 } };
      for (const r of refRows) {
        for (let c = 0; c < 4; c++) {
          if (r.LNHeads.includes(c)) colSummary[`C${c}`].LH++;
          if (r.LNTails.includes(c)) colSummary[`C${c}`].LT++;
          if (r.LNBodies.includes(c)) colSummary[`C${c}`].LB++;
          if (r.NormalNotes.includes(c)) colSummary[`C${c}`].NN++;
        }
      }

      // Jack pattern detection per column: same column normal notes close together
      const colJackCandidates: number[] = [];
      for (let c = 0; c < 4; c++) {
        // Get times of normal notes on this column
        const nnTimes = refRows.filter((r: any) => r.NormalNotes.includes(c)).map((r: any) => r.Time);
        let jackCount = 0;
        for (let i = 1; i < nnTimes.length; i++) {
          if (nnTimes[i] - nnTimes[i - 1] <= 200) jackCount++; // consecutive NN within 200ms = jack
        }
        if (jackCount >= 2) colJackCandidates.push(c);
      }

      const metrics = m.lnMetrics;
      const cs = colSummary;
      console.log(`\n  M${String(m.index + 1).padStart(2)} @ ${(mStart / 1000).toFixed(1)}s: sub=${m.lnSubtype?.slice(0, 8) ?? "?"}`);
      console.log(`   inv=${metrics.inverse.toFixed(0)}% ovl=${metrics.overlay.toFixed(0)}% ar=${metrics.ar.toFixed(0)}% ouro=${metrics.ouroboros.toFixed(0)}%`);
      console.log(`   C0: LH=${cs.C0.LH} LT=${cs.C0.LT} LB=${cs.C0.LB} NN=${cs.C0.NN}  | C1: LH=${cs.C1.LH} LT=${cs.C1.LT} LB=${cs.C1.LB} NN=${cs.C1.NN}`);
      console.log(`   C2: LH=${cs.C2.LH} LT=${cs.C2.LT} LB=${cs.C2.LB} NN=${cs.C2.NN}  | C3: LH=${cs.C3.LH} LT=${cs.C3.LT} LB=${cs.C3.LB} NN=${cs.C3.NN}`);
      if (colJackCandidates.length > 0) console.log(`   Jack candidates(cols with rapid NN): [${colJackCandidates.join(",")}]`);
    }
  }

  await s33detail();
  await s35detail();
}

main();
