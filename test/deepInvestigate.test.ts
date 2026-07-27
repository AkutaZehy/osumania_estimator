// Deep investigation of 5 specific maps
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REF_DIR = path.resolve(__dirname, "../References/osumania_map_analyser/ManiaMapAnalyser by Leo_Black");
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");

function getShortName(filename: string): string {
  const m = filename.match(/\[(.+?)\]/);
  return m ? m[1].replace(/\s*\(Marathon\)\s*$/, "") : filename;
}

async function main() {
  const parserMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/parser/patternOsuParser.js`);
  const summaryMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/summary.js`);
  const primMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/primitives.js`);
  const defMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/patternsDef.js`);
  const { parseOsuManiaFromText } = parserMod;
  const { fromChart } = summaryMod;
  const { calculatePrimitives } = primMod;

  const { OsuFileParser } = await import("../src/parser/osuFileParser.js");
  const { analyzeSections } = await import("../src/custom/sectionAnalysis.js");

  // Helper: load map data
  async function loadMap(file: string) {
    const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
    const chart = parseOsuManiaFromText(osuText);
    const primitives = calculatePrimitives(chart);
    const report = fromChart(chart);

    const parser = new OsuFileParser(osuText);
    parser.process();
    const beatmap = parser.getParsedData();
    const bpm = beatmap.timingPoints.find((tp: any) => tp.uninherited)
      ? Math.round(60000 / beatmap.timingPoints.find((tp: any) => tp.uninherited)!.beatLength) : 0;
    const section = analyzeSections(beatmap);

    return { osuText, chart, primitives, report, beatmap, bpm, section };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. Stage 2-6 Power To Progress — Two different LN sections
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function investigateS26() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 2") && f.includes("6th"))!;
    console.log(`\n${"█".repeat(130)}`);
    console.log(`  1. S2-6: ${getShortName(file)}`);
    console.log(`${"█".repeat(130)}`);

    const { primitives, report, bpm, section } = await loadMap(file);

    // Find LN sections: contiguous blocks of LN measures
    const lnMeasures = section.measures.filter((m: any) => m.category === "ln").map((m: any) => m);
    const sections: Array<{ start: number; end: number; measures: any[] }> = [];
    let cur: any[] = [];
    for (const m of lnMeasures) {
      if (cur.length === 0 || m.index === cur[cur.length - 1].index + 1) {
        cur.push(m);
      } else {
        if (cur.length >= 2) sections.push({ start: cur[0].startTime, end: cur[cur.length - 1].endTime, measures: cur });
        cur = [m];
      }
    }
    if (cur.length >= 2) sections.push({ start: cur[0].startTime, end: cur[cur.length - 1].endTime, measures: cur });

    // Find the two largest LN sections
    sections.sort((a, b) => b.end - b.start - (a.end - a.start));
    const top2 = sections.slice(0, Math.min(2, sections.length));

    for (let i = 0; i < top2.length; i++) {
      const sec = top2[i];
      const dur = ((sec.end - sec.start) / 1000).toFixed(1);
      const nMeasures = sec.measures.length;

      // Compute section metrics
      const withM = sec.measures.filter((m: any) => m.lnMetrics);
      const avgInv = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.inverse, 0) / withM.length : 0;
      const avgOvl = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.overlay, 0) / withM.length : 0;
      const avgAr = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.ar, 0) / withM.length : 0;
      const avgOuro = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.ouroboros, 0) / withM.length : 0;

      // Subtype breakdown
      const st: Record<string, number> = {};
      for (const m of sec.measures) {
        if (m.lnSubtype) st[m.lnSubtype] = (st[m.lnSubtype] || 0) + 1;
      }
      const total = sec.measures.length;

      // Find ref primitives in this section's time range
      const refRows = primitives.filter((p: any) => p.Time >= sec.start && p.Time < sec.end);
      const hasNormal = refRows.some((r: any) => r.NormalNotes.length > 0);
      const maxBodies = refRows.length > 0 ? Math.max(...refRows.map((r: any) => r.LNBodies.length)) : 0;
      const totalLH = refRows.reduce((s: number, r: any) => s + r.LNHeads.length, 0);
      const totalLT = refRows.reduce((s: number, r: any) => s + r.LNTails.length, 0);
      const totalNN = refRows.reduce((s: number, r: any) => s + r.NormalNotes.length, 0);

      // Column usage - which columns have LN heads
      const colHeads: number[] = [0, 0, 0, 0];
      for (const r of refRows) { for (const c of r.LNHeads) colHeads[c]++; }

      // Check for inverseReady windows
      const defMod2 = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/patternsDef.js`);
      const { inverseReady } = defMod2;
      let invWindows = 0;
      for (let j = 0; j < refRows.length - 4; j++) {
        try { if (inverseReady(refRows.slice(j, j + 5))) invWindows++; } catch { }
      }

      console.log(`\n  ── LN Section ${i + 1}: ${(sec.start / 1000).toFixed(1)}s-${(sec.end / 1000).toFixed(1)}s (${dur}s, ${nMeasures} measures) ──`);
      console.log(`  Metrics: inv=${avgInv.toFixed(1)}% ovl=${avgOvl.toFixed(1)}% ar=${avgAr.toFixed(1)}% ouro=${avgOuro.toFixed(1)}%`);
      console.log(`  Subtypes: ${Object.entries(st).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / total * 100)}%`).join(", ")}`);
      console.log(`  Ref rows: ${refRows.length} rows, ${totalLH} LH, ${totalLT} LT, ${totalNN} NN`);
      console.log(`  Ref primitive: hasNormal=${hasNormal}, maxBodies=${maxBodies}, invWindows5=${invWindows}`);
      console.log(`  Column heads: [${colHeads.join(", ")}]`);

      // Deduced construction
      if (avgInv >= 20 && avgOvl >= 40) {
        console.log(`  → 构造推测: LN Density/Inverse section`);
      } else if (avgAr >= 15 && avgOvl >= 30) {
        console.log(`  → 构造推测: TE/Release section (RS if ar>20, RR if ar<15)`);
      } else if (avgOvl < 20) {
        console.log(`  → 构造推测: CO/Shield or CO/ColLock (sparse LN)`);
      } else if (avgOuro >= 80 && avgInv < 25) {
        console.log(`  → 构造推测: WC/Ouroboros chain`);
      }
    }

    // Show ref clusters overlapping the two sections
    console.log(`\n  Ref clusters in this map (sorted by amount):`);
    const totalAmount = report.Clusters.reduce((s: number, c: any) => s + c.Amount, 0);
    for (const c of report.Clusters.sort((a: any, b: any) => b.Amount - a.Amount).slice(0, 10)) {
      const st = c.SpecificTypes?.[0]?.[0] ?? "(none)";
      console.log(`    ${(c.Amount / totalAmount * 100).toFixed(0)}%  ${c.Pattern}/${st}  ${(c.Amount / 1000).toFixed(1)}s @ ${c.BPM ? Math.round(c.BPM) : "?"}BPM`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. Stage 3-3 i use raw expectation — Three different LN constructions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function investigateS33() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 3") && f.includes("3rd"))!;
    console.log(`\n${"█".repeat(130)}`);
    console.log(`  2. S3-3: ${getShortName(file)}`);
    console.log(`${"█".repeat(130)}`);

    const { primitives, report, bpm, section } = await loadMap(file);

    const lnMeasures = section.measures.filter((m: any) => m.category === "ln").map((m: any) => m);

    // Find contiguous LN sections
    const sections: Array<{ start: number; end: number; measures: any[] }> = [];
    let cur: any[] = [];
    for (const m of lnMeasures) {
      if (cur.length === 0 || m.index === cur[cur.length - 1].index + 1) {
        cur.push(m);
      } else {
        if (cur.length >= 2) sections.push({ start: cur[0].startTime, end: cur[cur.length - 1].endTime, measures: cur });
        cur = [m];
      }
    }
    if (cur.length >= 2) sections.push({ start: cur[0].startTime, end: cur[cur.length - 1].endTime, measures: cur });

    // The user says: two main LN sections, the second is long, can be split into two parts
    // So we should expect 2-3 sections
    console.log(`\n  Total LN sections found: ${sections.length}`);
    console.log(`  BPM: ${bpm}`);

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const dur = ((sec.end - sec.start) / 1000).toFixed(1);
      const withM = sec.measures.filter((m: any) => m.lnMetrics);
      const avgInv = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.inverse, 0) / withM.length : 0;
      const avgOvl = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.overlay, 0) / withM.length : 0;
      const avgAr = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.ar, 0) / withM.length : 0;
      const avgOuro = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.ouroboros, 0) / withM.length : 0;

      const st: Record<string, number> = {};
      for (const m of sec.measures) { if (m.lnSubtype) st[m.lnSubtype] = (st[m.lnSubtype] || 0) + 1; }
      const totalM = sec.measures.length;

      const refRows = primitives.filter((p: any) => p.Time >= sec.start && p.Time < sec.end);
      const colHeads: number[] = [0, 0, 0, 0];
      for (const r of refRows) { for (const c of r.LNHeads) colHeads[c]++; }
      const colTails: number[] = [0, 0, 0, 0];
      for (const r of refRows) { for (const c of r.LNTails) colTails[c]++; }

      console.log(`\n  ── Section ${i + 1}: ${(sec.start / 1000).toFixed(1)}s-${(sec.end / 1000).toFixed(1)}s (${dur}s, ${totalM} measures) ──`);
      console.log(`  Metrics: inv=${avgInv.toFixed(1)}% ovl=${avgOvl.toFixed(1)}% ar=${avgAr.toFixed(1)}% ouro=${avgOuro.toFixed(1)}%`);
      console.log(`  Subtypes: ${Object.entries(st).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / totalM * 100)}%`).join(", ")}`);
      console.log(`  Column LN heads: [${colHeads.join(", ")}]  tails: [${colTails.join(", ")}]`);
    }

    // If the last section is large, try splitting it
    if (sections.length >= 2) {
      const last = sections[sections.length - 1];
      const mid = Math.floor(last.measures.length / 2);
      // Try to find a natural split point
      let splitIdx = mid;
      // Look for a measure with low overlay or subtype change
      for (let j = Math.max(2, mid - 2); j < Math.min(last.measures.length - 2, mid + 2); j++) {
        const m = last.measures[j];
        const mNext = last.measures[j + 1];
        if (m.lnSubtype !== mNext.lnSubtype) { splitIdx = j + 1; break; }
      }

      console.log(`\n  → Splitting last section at measure offset ${splitIdx}/${last.measures.length}:`);

      const halves = [
        { measures: last.measures.slice(0, splitIdx), name: "后半-前段" },
        { measures: last.measures.slice(splitIdx), name: "后半-后段" },
      ];

      for (const h of halves) {
        if (h.measures.length < 2) continue;
        const sec = h.measures;
        const dur = ((sec[sec.length - 1].endTime - sec[0].startTime) / 1000).toFixed(1);
        const withM = sec.filter((m: any) => m.lnMetrics);
        const avgInv = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.inverse, 0) / withM.length : 0;
        const avgOvl = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.overlay, 0) / withM.length : 0;
        const avgAr = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.ar, 0) / withM.length : 0;
        const avgOuro = withM.length > 0 ? withM.reduce((s: number, m: any) => s + m.lnMetrics.ouroboros, 0) / withM.length : 0;
        const st: Record<string, number> = {};
        for (const m of sec) { if (m.lnSubtype) st[m.lnSubtype] = (st[m.lnSubtype] || 0) + 1; }

        const refRows2 = primitives.filter((p: any) => p.Time >= sec[0].startTime && p.Time < sec[sec.length - 1].endTime);
        const colHeads: number[] = [0, 0, 0, 0];
        for (const r of refRows2) { for (const c of r.LNHeads) colHeads[c]++; }

        console.log(`\n    ${h.name} @ ${(sec[0].startTime / 1000).toFixed(1)}s-${(sec[sec.length - 1].endTime / 1000).toFixed(1)}s (${dur}s)`);
        console.log(`    Metrics: inv=${avgInv.toFixed(1)}% ovl=${avgOvl.toFixed(1)}% ar=${avgAr.toFixed(1)}% ouro=${avgOuro.toFixed(1)}%`);
        console.log(`    Subtypes: ${Object.entries(st).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / sec.length * 100)}%`).join(", ")}`);
        console.log(`    Column heads: [${colHeads.join(", ")}]`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. Stage 4-4 #FairyJoke — Full ouroboros chain with 3 constructions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function investigateS44() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 4") && f.includes("4th"))!;
    console.log(`\n${"█".repeat(130)}`);
    console.log(`  3. S4-4: ${getShortName(file)}`);
    console.log(`${"█".repeat(130)}`);

    const { primitives, report, bpm, section } = await loadMap(file);

    const lnMeasures = section.measures.filter((m: any) => m.category === "ln").map((m: any) => m);

    // Per-measure detailed view for the whole map
    console.log(`\n  BPM: ${bpm} | Total LN measures: ${lnMeasures.length}`);
    console.log(`\n  Per-measure LN metrics (chronological):`);
    console.log(`  # | time | subtype | inv% ovl% ar% ouro% | col LN bodies pattern`);
    for (let i = 0; i < lnMeasures.length; i++) {
      const m = lnMeasures[i];
      const metrics = m.lnMetrics;
      if (!metrics) continue;
      const t = (m.startTime / 1000).toFixed(1);
      const inv = metrics.inverse.toFixed(0);
      const ovl = metrics.overlay.toFixed(0);
      const ar = metrics.ar.toFixed(0);
      const ouro = metrics.ouroboros.toFixed(0);

      // Column body distribution for this measure
      const colBodies = metrics.columnBodies ? metrics.columnBodies.map((c: number) => c > 2 ? "▮" : c > 0 ? "▣" : "□").join("") : "????";

      console.log(`  ${String(m.index + 1).padStart(3)} | ${t.padStart(5)}s | ${(m.lnSubtype || "?").slice(0, 10).padEnd(10)} | ${inv.padStart(2)} ${ovl.padStart(3)} ${ar.padStart(2)} ${ouro.padStart(3)} | ${colBodies}`);
    }

    // Now find contiguous sections with different characteristics
    // The user says: 3 constructions: (1) LN inverse, (2) one hand lock + 3-hand ouroboros, (3) full JS-like speed
    const fwd = lnMeasures.filter((m: any) => m.lnMetrics);
    const segments: Array<{ start: number; end: number; type: string; metrics: any[]; measures: any[] }> = [];

    let segStart = 0;
    for (let i = 1; i < fwd.length; i++) {
      const prev = fwd[i - 1].lnMetrics;
      const curr = fwd[i].lnMetrics;
      if (!prev || !curr) continue;

      const prevOuro = prev.ouroboros;
      const currOuro = curr.ouroboros;
      const prevInv = prev.inverse;
      const currInv = curr.inverse;

      // Detect significant change
      const ouroJump = Math.abs(currOuro - prevOuro) > 60;
      const invJump = Math.abs(currInv - prevInv) > 20;
      const ovlJump = Math.abs(curr.overlay - prev.overlay) > 40;

      if (ouroJump || (invJump && ovlJump)) {
        const slice = fwd.slice(segStart, i);
        if (slice.length >= 2) {
          const avgOuro = slice.reduce((s, m: any) => s + m.lnMetrics.ouroboros, 0) / slice.length;
          const avgInv = slice.reduce((s, m: any) => s + m.lnMetrics.inverse, 0) / slice.length;
          const avgOvl = slice.reduce((s, m: any) => s + m.lnMetrics.overlay, 0) / slice.length;
          const avgAr = slice.reduce((s, m: any) => s + m.lnMetrics.ar, 0) / slice.length;
          let type = "?";
          if (avgOuro >= 120) type = "OC";
          else if (avgInv >= 25 && avgOvl >= 60) type = "INV";
          else if (avgOvl >= 50 && avgOuro >= 80) type = "OC-INV";
          else if (avgAr >= 15) type = "REL";
          else type = "MIX";

          segments.push({
            start: slice[0].startTime, end: slice[slice.length - 1].endTime,
            type, metrics: [{ inverse: avgInv, overlay: avgOvl, ar: avgAr, ouroboros: avgOuro }],
            measures: slice,
          });
        }
        segStart = i;
      }
    }
    // Last segment
    if (segStart < fwd.length) {
      const slice = fwd.slice(segStart);
      if (slice.length >= 2) {
        segments.push({
          start: slice[0].startTime, end: slice[slice.length - 1].endTime,
          type: "?",
          metrics: [{
            inverse: slice.reduce((s: number, m: any) => s + m.lnMetrics.inverse, 0) / slice.length,
            overlay: slice.reduce((s: number, m: any) => s + m.lnMetrics.overlay, 0) / slice.length,
            ar: slice.reduce((s: number, m: any) => s + m.lnMetrics.ar, 0) / slice.length,
            ouroboros: slice.reduce((s: number, m: any) => s + m.lnMetrics.ouroboros, 0) / slice.length,
          }],
          measures: slice,
        });
      }
    }

    console.log(`\n  ── Segments detected by metric change ──`);
    for (const seg of segments) {
      const m = seg.metrics[0];
      const dur = ((seg.end - seg.start) / 1000).toFixed(1);
      const subtypes: Record<string, number> = {};
      for (const ms of seg.measures) {
        if (ms.lnSubtype) subtypes[ms.lnSubtype] = (subtypes[ms.lnSubtype] || 0) + 1;
      }
      console.log(`  ${seg.type} @ ${(seg.start / 1000).toFixed(1)}s-${(seg.end / 1000).toFixed(1)}s (${dur}s, ${seg.measures.length}ms)`);
      console.log(`    inv=${m.inverse.toFixed(1)}% ovl=${m.overlay.toFixed(1)}% ar=${m.ar.toFixed(1)}% ouro=${m.ouroboros.toFixed(1)}%`);
      console.log(`    subtypes: ${Object.entries(subtypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / seg.measures.length * 100)}%`).join(", ")}`);
    }

    // Check for WC characteristics
    console.log(`\n  ── WC characteristics check ──`);
    // Check for Speedy WC in ref clusters that overlap with high-ouro sections
    const speedyClusters = report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Speedy WC");
    const jackyClusters = report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Jacky WC");
    console.log(`  Ref Speedy WC: ${speedyClusters.reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);
    console.log(`  Ref Jacky WC: ${jackyClusters.reduce((s: number, c: any) => s + c.Amount, 0) / 1000}s`);

    // For each segment, check ref classification at that time range
    for (const seg of segments) {
      const segClusters = report.Clusters.filter((c: any) => {
        // Crude overlap check - ref clusters have start/end? Not sure if available
        return true; // We'll just report all clusters
      });
    }

    // Check BPM of high-ouro measures
    const highOuro = fwd.filter((m: any) => m.lnMetrics && m.lnMetrics.ouroboros >= 80);
    if (highOuro.length > 0) {
      console.log(`\n  Measures with ouro>=80: ${highOuro.length}/${fwd.length}`);
      // Check which columns are active
      const colAll: number[] = [0, 0, 0, 0];
      for (const m of highOuro) {
        const refRows = primitives.filter((p: any) => p.Time >= m.startTime && p.Time < m.endTime);
        for (const r of refRows) {
          for (const c of r.LNHeads) colAll[c]++;
          for (const c of r.LNBodies) colAll[c]++;
        }
      }
      console.log(`  Column activity (heads+bodies) in high-ouro sections: ${colAll.map((v, i) => `C${i}=${v}`).join(", ")}`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. Stage 2-7 On the FM + Stage 3-5 Promise — data verification
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function investigateS27() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 2") && f.includes("7th"))!;
    console.log(`\n${"█".repeat(130)}`);
    console.log(`  4a. S2-7: ${getShortName(file)}`);
    console.log(`${"█".repeat(130)}`);

    const { primitives, report, bpm, section } = await loadMap(file);

    // Ref cluster breakdown
    console.log(`\n  BPM: ${bpm}`);
    const total = report.Clusters.reduce((s: number, c: any) => s + c.Amount, 0);
    console.log(`  Ref clusters:`);
    for (const c of report.Clusters.sort((a: any, b: any) => b.Amount - a.Amount).slice(0, 12)) {
      const st = c.SpecificTypes?.[0];
      const stName = st ? st[0] : "(none)";
      const stPct = st ? (st[1] * 100).toFixed(0) : "-";
      console.log(`    ${(c.Amount / total * 100).toFixed(0)}%  ${c.Pattern}/${stName} ${(c.Amount / 1000).toFixed(1)}s @ ${c.BPM ? Math.round(c.BPM) : "?"}BPM (specific=${stPct}%)`);
    }

    // Check for Jacky WC patterns - how much of it is actually LN-context-based
    const jackyClusters = report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Jacky WC");
    console.log(`\n  Jacky WC total: ${(jackyClusters.reduce((s: number, c: any) => s + c.Amount, 0) / 1000).toFixed(1)}s (${(jackyClusters.reduce((s: number, c: any) => s + c.Amount, 0) / total * 100).toFixed(0)}%)`);

    // Check Shield
    const shieldClusters = report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Shield");
    console.log(`  Shield total: ${(shieldClusters.reduce((s: number, c: any) => s + c.Amount, 0) / 1000).toFixed(1)}s (${(shieldClusters.reduce((s: number, c: any) => s + c.Amount, 0) / total * 100).toFixed(0)}%)`);

    // Check Inverse
    const invClusters = report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Inverse");
    console.log(`  Inverse total: ${(invClusters.reduce((s: number, c: any) => s + c.Amount, 0) / 1000).toFixed(1)}s`);

    // Which columns have LN heads?
    const colHeads: number[] = [0, 0, 0, 0];
    for (const r of primitives) { for (const c of r.LNHeads) colHeads[c]++; }
    console.log(`\n  Column LN heads: [${colHeads.join(", ")}]`);

    // Per-measure breakdown for inverse+shield+jw cross check
    const lnMeasures = section.measures.filter((m: any) => m.category === "ln" && m.lnMetrics);
    let highInvCount = 0, highShieldCount = 0, highJW = 0;
    for (const m of lnMeasures) {
      if (m.lnMetrics.inverse >= 25) highInvCount++;
      if (m.lnSubtype === "LN Cover" || m.lnSubtype === "LN Release") highShieldCount++;
    }

    // Count norms per measure
    const refRows = primitives;
    const measWithNN = refRows.filter((r: any) => r.NormalNotes.length > 0).length;
    const measWithLH = refRows.filter((r: any) => r.LNHeads.length > 0).length;

    console.log(`\n  Ref rows with NormalNotes: ${measWithNN}/${refRows.length}`);
    console.log(`  Ref rows with LNHeads: ${measWithLH}/${refRows.length}`);
    console.log(`  Our LN measures with inverse>=25: ${highInvCount}/${lnMeasures.length}`);
    console.log(`  Average metrics: inv=${lnMeasures.reduce((s: number, m: any) => s + m.lnMetrics.inverse, 0) / lnMeasures.length}`);
    console.log(`  Overlay: ${lnMeasures.reduce((s: number, m: any) => s + m.lnMetrics.overlay, 0) / lnMeasures.length}`);
  }

  async function investigateS35() {
    const file = fs.readdirSync(LN_MAPS_DIR).find(f => f.includes("Stage 3") && f.includes("5th"))!;
    console.log(`\n${"█".repeat(130)}`);
    console.log(`  4b. S3-5: ${getShortName(file)}`);
    console.log(`${"█".repeat(130)}`);

    const { primitives, report, bpm, section } = await loadMap(file);

    const total = report.Clusters.reduce((s: number, c: any) => s + c.Amount, 0);
    console.log(`\n  BPM: ${bpm}`);
    console.log(`  Ref clusters:`);
    for (const c of report.Clusters.sort((a: any, b: any) => b.Amount - a.Amount).slice(0, 12)) {
      const st = c.SpecificTypes?.[0];
      const stName = st ? st[0] : "(none)";
      const stPct = st ? (st[1] * 100).toFixed(0) : "-";
      console.log(`    ${(c.Amount / total * 100).toFixed(0)}%  ${c.Pattern}/${stName} ${(c.Amount / 1000).toFixed(1)}s @ ${c.BPM ? Math.round(c.BPM) : "?"}BPM (specific=${stPct}%)`);
    }

    // Column analysis
    const colHeads: number[] = [0, 0, 0, 0];
    const colTails: number[] = [0, 0, 0, 0];
    const colNormals: number[] = [0, 0, 0, 0];
    for (const r of primitives) {
      for (const c of r.LNHeads) colHeads[c]++;
      for (const c of r.LNTails) colTails[c]++;
      for (const c of r.NormalNotes) colNormals[c]++;
    }
    console.log(`\n  Column LN heads: [${colHeads.join(", ")}]`);
    console.log(`  Column LN tails: [${colTails.join(", ")}]`);
    console.log(`  Column normal notes: [${colNormals.join(", ")}]`);

    // Are there columns with only normal notes (no LN)?
    for (let c = 0; c < 4; c++) {
      if (colHeads[c] === 0) console.log(`  Column ${c}: NO LN heads (normal-only or mixed?)`);
    }

    // Check specific: 2-column inverse + 2-column Jacky WC
    // Look for measures where two columns have high body count (inverse) and two have jack patterns
    const lnMeasures = section.measures.filter((m: any) => m.category === "ln" && m.lnMetrics);
    console.log(`\n  LN measures with metrics: ${lnMeasures.length}`);

    // For each measure, show column body distribution and detect dual-zone
    let dualZoneCount = 0;
    for (const m of lnMeasures) {
      const metrics = m.lnMetrics;
      if (!metrics || !metrics.columnBodies) continue;
      const cb = metrics.columnBodies as number[];
      // 2 columns high body count for inverse, 2 columns low
      const colBodies = cb.map((c: number) => c);
      const highCols = colBodies.filter((c: number) => c >= 3).length;
      const lowCols = colBodies.filter((c: number) => c <= 1).length;
      if (highCols === 2 && lowCols === 2) {
        dualZoneCount++;
        if (dualZoneCount <= 5) {
          console.log(`  M${m.index + 1} dual-zone: cb=[${colBodies.join(",")}] inv=${metrics.inverse.toFixed(0)}% ovl=${metrics.overlay.toFixed(0)}% ar=${metrics.ar.toFixed(0)}% ouro=${metrics.ouroboros.toFixed(0)}%`);
        }
      }
    }
    console.log(`  Dual-zone measures (2 high body + 2 low body): ${dualZoneCount}/${lnMeasures.length}`);

    // Check Shield count
    const shieldClusters = report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Shield");
    const colLockClusters = report.Clusters.filter((c: any) => c.SpecificTypes?.[0]?.[0] === "Column Lock");
    console.log(`\n  Shield: ${(shieldClusters.reduce((s: number, c: any) => s + c.Amount, 0) / 1000).toFixed(1)}s`);
    console.log(`  Column Lock: ${(colLockClusters.reduce((s: number, c: any) => s + c.Amount, 0) / 1000).toFixed(1)}s`);

    // How many jack patterns in ref?
    const jackRelated = report.Clusters.filter((c: any) => c.Pattern === "Jacks" || c.SpecificTypes?.[0]?.[0]?.includes("Jack"));
    console.log(`\n  Jack-related ref clusters:`);
    for (const c of jackRelated) {
      const st = c.SpecificTypes?.[0]?.[0] ?? c.Pattern;
      console.log(`    ${(c.Amount / 1000).toFixed(1)}s ${st} @ ${c.BPM ? Math.round(c.BPM) : "?"}BPM`);
    }
  }

  // ── Run all ──
  await investigateS26();
  await investigateS33();
  await investigateS44();
  await investigateS27();
  await investigateS35();
}

main();
