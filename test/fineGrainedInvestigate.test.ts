// Fine-grained per-row analysis for S4-4 and S3-5
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REF_DIR = path.resolve(__dirname, "../References/osumania_map_analyser/ManiaMapAnalyser by Leo_Black");
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");

function visualizeCols(r: any): string {
  let s = "";
  for (let c = 0; c < 4; c++) {
    if (r.LNHeads.includes(c)) s += "H";
    else if (r.LNTails.includes(c)) s += "T";
    else if (r.LNBodies.includes(c)) s += "B";
    else if (r.NormalNotes.includes(c)) s += "N";
    else s += ".";
  }
  return s;
}

function rowType(r: any): string {
  const hasH = r.LNHeads.length > 0;
  const hasT = r.LNTails.length > 0;
  const hasB = r.LNBodies.length > 0;
  const hasN = r.NormalNotes.length > 0;
  if (hasH && hasT) return "H+T";
  if (hasH) return "H";
  if (hasT) return "T";
  if (hasB && hasN) return "B+N";
  if (hasB) return "B";
  if (hasN) return "N";
  return ".";
}

async function main() {
  const parserMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/parser/patternOsuParser.js`);
  const summaryMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/summary.js`);
  const primMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/primitives.js`);
  const { parseOsuManiaFromText } = parserMod;
  const { fromChart } = summaryMod;
  const { calculatePrimitives } = primMod;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // S4-4: Per-row grouped analysis (8-row windows)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function s44Fine() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 4") && f.includes("4th"))!;
    const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
    const chart = parseOsuManiaFromText(osuText);
    const primitives = calculatePrimitives(chart);
    const report = fromChart(chart);

    console.log(`\n${"█".repeat(140)}`);
    console.log(`  S4-4: ${file.match(/\[(.+?)\]/)?.[1]} — Per-row analysis (8-row windows)`);
    console.log(`  Ref Speedy WC: ${report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Speedy WC").reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`  Ref Jacky WC: ${report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Jacky WC").reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`  Ref Inverse: ${report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Inverse").reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`${"█".repeat(140)}`);

    // BPM zones
    const totalRows = primitives.length;
    let firstRowTime = primitives[0]?.Time ?? 0;

    // Group into 8-row windows for readability
    const WINDOW = 8;
    for (let i = 0; i < totalRows; i += WINDOW) {
      const batch = primitives.slice(i, i + WINDOW);
      const t0 = (batch[0].Time / 1000).toFixed(1);
      const t1 = (batch[batch.length - 1].Time / 1000).toFixed(1);

      // Column state across these rows
      let c0state = "", c1state = "", c2state = "", c3state = "";
      for (const r of batch) {
        const vis = visualizeCols(r);
        c0state += vis[0];
        c1state += vis[1];
        c2state += vis[2];
        c3state += vis[3];
      }

      // Stats
      const nLNs = batch.filter((r: any) => r.LNHeads.length > 0 || r.LNBodies.length > 0 || r.LNTails.length > 0).length;
      const nNN = batch.filter((r: any) => r.NormalNotes.length > 0).length;
      const nBody = batch.filter((r: any) => r.LNBodies.length > 0).length;
      const nHead = batch.filter((r: any) => r.LNHeads.length > 0).length;
      const nTail = batch.filter((r: any) => r.LNTails.length > 0).length;

      // LN density per row (sum of columns with LN activity)
      const lnColsPerRow = batch.map((r: any) =>
        new Set([...r.LNHeads, ...r.LNBodies, ...r.LNTails]).size
      );
      const avgLNCols = lnColsPerRow.reduce((s: number, v: number) => s + v, 0) / batch.length;

      // Check: is one column "locked" (always in body/head across all rows)?
      const colActive = [0, 0, 0, 0];
      for (const r of batch) {
        const active = new Set([...r.LNHeads, ...r.LNBodies]);
        for (const c of active) colActive[c]++;
      }
      const lockedCols = colActive.map((v, idx) => v >= batch.length * 0.7 ? idx : -1).filter(v => v >= 0);

      // Detect which patterns are present
      let patterns: string[] = [];

      // Inverse pattern: H and T alternating in same window
      const hasH = batch.some((r: any) => r.LNHeads.length > 0);
      const hasT = batch.some((r: any) => r.LNTails.length > 0);
      const hasB = batch.some((r: any) => r.LNBodies.length > 0);

      // Body overlap count
      const bodyOverlap3 = batch.filter((r: any) => r.LNBodies.length >= 3).length;
      const bodyOverlap2 = batch.filter((r: any) => r.LNBodies.length >= 2).length;

      // Speed check - BPM from row spacing
      const dt = batch.length >= 2 ? batch[batch.length - 1].Time - batch[0].Time : 0;
      const approxBPM = dt > 0 ? Math.round(60000 / (dt / (batch.length - 1)) * 4) : 0;

      if (lockedCols.length >= 1) {
        patterns.push(`LOCK[C${lockedCols.join(",")}]`);
      }
      if (bodyOverlap3 >= 2) {
        patterns.push(`WALL3(${bodyOverlap3})`);
      } else if (bodyOverlap2 >= 3) {
        patterns.push(`WALL2(${bodyOverlap2})`);
      }
      if (avgLNCols >= 2.5 && bodyOverlap3 === 0) {
        patterns.push("INV-LIKE");
      }
      if (nNN > 0 && nBody > 0) {
        patterns.push("LN+RC");
      } else if (nNN > 0 && nBody === 0) {
        patterns.push("RC-ONLY");
      }
      if (approxBPM >= 250) {
        patterns.push(`SPEED${approxBPM}`);
      }

      // Print this window
      console.log(`\n  [${t0}s-${t1}s] ${batch.length}rows dt=${dt}ms ~${approxBPM}BPM  ${patterns.join(" | ")}`);
      console.log(`    C0: ${c0state}`);
      console.log(`    C1: ${c1state}`);
      console.log(`    C2: ${c2state}`);
      console.log(`    C3: ${c3state}`);
      console.log(`    LN=${nLNs}/${batch.length} NN=${nNN} H=${nHead} B=${nBody} T=${nTail} avgLNCols=${avgLNCols.toFixed(1)}`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // S3-5: Per-row analysis focusing on column-level jack detection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function s35Fine() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 3") && f.includes("5th"))!;
    const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
    const chart = parseOsuManiaFromText(osuText);
    const primitives = calculatePrimitives(chart);
    const report = fromChart(chart);

    console.log(`\n${"█".repeat(140)}`);
    console.log(`  S3-5: ${file.match(/\[(.+?)\]/)?.[1]} — Per-row analysis (8-row windows)`);
    console.log(`  Ref Jacky WC: ${report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Jacky WC").reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`  Ref Column Lock: ${report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Column Lock").reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`  Ref Shield: ${report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Shield").reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`  Ref Inverse: ${report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Inverse").reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`${"█".repeat(140)}`);

    const totalRows = primitives.length;
    const WINDOW = 8;

    for (let i = 0; i < totalRows; i += WINDOW) {
      const batch = primitives.slice(i, i + WINDOW);
      const t0 = (batch[0].Time / 1000).toFixed(1);
      const t1 = (batch[batch.length - 1].Time / 1000).toFixed(1);

      let c0s = "", c1s = "", c2s = "", c3s = "";
      for (const r of batch) {
        const v = visualizeCols(r);
        c0s += v[0]; c1s += v[1]; c2s += v[2]; c3s += v[3];
      }

      // Per-column NN count (rapid fire detection)
      const colNNSeq: number[][] = [[], [], [], []];
      for (const r of batch) {
        for (let c = 0; c < 4; c++) {
          if (r.NormalNotes.includes(c)) colNNSeq[c].push(r.Time);
        }
      }

      const colJackInfo: string[] = [];
      for (let c = 0; c < 4; c++) {
        const nn = colNNSeq[c];
        let jackCount = 0;
        let minGap = Infinity;
        for (let j = 1; j < nn.length; j++) {
          const gap = nn[j] - nn[j - 1];
          minGap = Math.min(minGap, gap);
          if (gap <= 200) jackCount++;
        }
        if (jackCount >= 2) {
          colJackInfo.push(`C${c}:${jackCount}j@${Math.round(minGap)}ms`);
        }
      }

      // Column-level LH/LT distribution
      const colLH = [0, 0, 0, 0];
      const colLT = [0, 0, 0, 0];
      const colLB = [0, 0, 0, 0];
      const colNN = [0, 0, 0, 0];
      for (const r of batch) {
        for (let c = 0; c < 4; c++) {
          if (r.LNHeads.includes(c)) colLH[c]++;
          if (r.LNTails.includes(c)) colLT[c]++;
          if (r.LNBodies.includes(c)) colLB[c]++;
          if (r.NormalNotes.includes(c)) colNN[c]++;
        }
      }

      // Detect LN-heavy vs NN-heavy columns
      const colLN = colLH.map((lh, i) => lh + colLB[i] + colLT[i]);
      const lnNNratio = colLN.map((ln, i) => colNN[i] === 0 ? ln : ln / colNN[i]);

      // Pattern classification
      let patterns: string[] = [];
      const hasB = batch.some((r: any) => r.LNBodies.length > 0);
      const hasN = batch.some((r: any) => r.NormalNotes.length > 0);
      const bodyOverlap3 = batch.filter((r: any) => r.LNBodies.length >= 3).count;

      if (hasB && hasN) patterns.push("LN+RC");
      if (colJackInfo.length >= 2) patterns.push(`JACKY[${colJackInfo.join(",")}]`);
      else if (colJackInfo.length === 1) patterns.push(`MINI-JACK[${colJackInfo[0]}]`);

      // Column asymmetry detection
      const maxLN = Math.max(...colLN);
      const minLN = Math.min(...colLN);
      if (maxLN - minLN >= 3) {
        const highLN = colLN.map((v, i) => v >= maxLN - 1 ? i : -1).filter(v => v >= 0);
        const highNN = colNN.map((v, i) => v >= Math.max(...colNN) - 1 ? i : -1).filter(v => v >= 0);
        patterns.push(`ASYMM: LN>[${highLN.join(",")}] NN>[${highNN.join(",")}]`);
      }

      console.log(`\n  [${t0}s-${t1}s] ${batch.length}rows ${patterns.join(" | ")}`);
      console.log(`    C0: ${c0s}`);
      console.log(`    C1: ${c1s}`);
      console.log(`    C2: ${c2s}`);
      console.log(`    C3: ${c3s}`);
      console.log(`    LH:[${colLH.join(",")}] LB:[${colLB.join(",")}] LT:[${colLT.join(",")}] NN:[${colNN.join(",")}]`);
    }
  }

  await s44Fine();
  await s35Fine();
}

main();
